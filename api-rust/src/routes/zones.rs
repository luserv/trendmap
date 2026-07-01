use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::error::AppError;

#[derive(Deserialize)]
pub struct CreateZoneInput {
    name: String,
    color: Option<String>,
    coordinates: Vec<[f64; 2]>,
}

#[derive(Deserialize)]
pub struct UpdateZoneInput {
    name: Option<String>,
    color: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/geo/zones", get(list_zones))
        .route("/zones", post(create_zone))
        .route("/zones/:id", patch(update_zone).delete(remove_zone))
        .route("/zones/:id/contacts", get(zone_contacts))
}

async fn list_zones(
    State(pool): State<PgPool>,
) -> Result<Json<Value>, AppError> {
    let row = sqlx::query(
        r#"SELECT json_build_object(
            'type','FeatureCollection',
            'features', COALESCE(json_agg(json_build_object(
               'type','Feature',
               'geometry', ST_AsGeoJSON(z.geom)::json,
               'properties', json_build_object(
                  'zone_id',       z.id,
                  'name',          z.name,
                  'color',         z.color,
                  'contact_count', (
                    SELECT count(DISTINCT l.contact_id)
                      FROM contact_location l
                     WHERE ST_Within(l.geom::geometry, z.geom::geometry)
                  )
               ))), '[]'::json)
           ) AS geojson
           FROM zone z"#,
    )
    .fetch_one(&pool)
    .await?;

    let geojson: Value = row.try_get("geojson")?;
    Ok(Json(geojson))
}

async fn create_zone(
    State(pool): State<PgPool>,
    Json(body): Json<CreateZoneInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    if body.name.trim().is_empty() || body.coordinates.len() < 3 {
        return Err(AppError::BadRequest("name y coordinates (mín 3 puntos) requeridos".into()));
    }

    let mut coords = body.coordinates.clone();
    let first = coords[0];
    let last = coords[coords.len() - 1];
    if first[0] != last[0] || first[1] != last[1] {
        coords.push(first);
    }

    let geojson = json!({ "type": "Polygon", "coordinates": [coords] }).to_string();

    let row = sqlx::query(
        "INSERT INTO zone (name, color, geom)
         VALUES ($1, $2, ST_GeomFromGeoJSON($3)::geography)
         RETURNING id, name, color",
    )
    .bind(body.name.trim())
    .bind(body.color.unwrap_or_else(|| "#38bdf8".to_string()))
    .bind(&geojson)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref d) = e {
            if d.code().as_deref() == Some("22023") {
                return AppError::BadRequest("polígono inválido".into());
            }
        }
        AppError::Sqlx(e)
    })?;

    Ok((StatusCode::CREATED, Json(json!({
        "id": row.get::<i64, _>("id"),
        "name": row.get::<String, _>("name"),
        "color": row.get::<String, _>("color"),
    }))))
}

async fn update_zone(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateZoneInput>,
) -> Result<Json<Value>, AppError> {
    let row = sqlx::query(
        "UPDATE zone SET name=COALESCE($2, name), color=COALESCE($3, color)
          WHERE id=$1 RETURNING id, name, color",
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.color)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!({
        "id": row.get::<i64, _>("id"),
        "name": row.get::<String, _>("name"),
        "color": row.get::<String, _>("color"),
    })))
}

async fn remove_zone(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM zone WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn zone_contacts(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let exists: (bool,) = sqlx::query_as("SELECT EXISTS(SELECT 1 FROM zone WHERE id=$1)")
        .bind(id)
        .fetch_one(&pool)
        .await?;

    if !exists.0 {
        return Err(AppError::NotFound);
    }

    let rows = sqlx::query(
        r#"SELECT c.contact_id, c.first_name, c.surname,
                  ST_X(l.geom::geometry) AS lng, ST_Y(l.geom::geometry) AS lat
             FROM zone z
             JOIN contact_location l ON ST_Within(l.geom::geometry, z.geom::geometry)
             JOIN contact c ON c.contact_id = l.contact_id
            WHERE z.id = $1
            ORDER BY c.surname, c.first_name"#,
    )
    .bind(id)
    .fetch_all(&pool)
    .await?;

    let contacts: Vec<Value> = rows.iter().map(|r| json!({
        "contact_id": r.get::<String, _>("contact_id"),
        "first_name": r.get::<String, _>("first_name"),
        "surname": r.get::<String, _>("surname"),
        "lng": r.get::<f64, _>("lng"),
        "lat": r.get::<f64, _>("lat"),
    })).collect();

    Ok(Json(json!(contacts)))
}
