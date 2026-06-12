use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::error::AppError;

#[derive(Deserialize)]
pub struct LocationInput {
    lng: f64,
    lat: f64,
    kind: Option<String>,
    address: Option<String>,
    is_primary: Option<bool>,
    blur: Option<bool>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/locations", post(add_location))
        .route("/contacts/:id/location", put(upsert_primary))
        .route("/contacts/:id/locations/:loc_id", delete(remove_location))
}

fn row_to_location(r: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": r.get::<i64, _>("id"),
        "kind": r.get::<Option<String>, _>("kind"),
        "address": r.get::<Option<String>, _>("address"),
        "is_primary": r.get::<bool, _>("is_primary"),
        "lng": r.get::<Option<f64>, _>("lng"),
        "lat": r.get::<Option<f64>, _>("lat"),
    })
}

async fn add_location(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<LocationInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let blur_expr = if body.blur.unwrap_or(false) {
        "ST_SnapToGrid(ST_MakePoint($2,$3), 0.005)::geography"
    } else {
        "NULL"
    };

    let sql = format!(
        "INSERT INTO contact_location (contact_id, kind, address, is_primary, geom, geom_blurred)
         VALUES ($1,$4,$5,$6, ST_MakePoint($2,$3)::geography, {blur_expr})
         RETURNING id, kind, address, is_primary,
                   ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat"
    );

    let row = sqlx::query(&sql)
        .bind(&contact_id)
        .bind(body.lng)
        .bind(body.lat)
        .bind(&body.kind)
        .bind(&body.address)
        .bind(body.is_primary.unwrap_or(false))
        .fetch_one(&pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref d) if d.code().as_deref() == Some("23503") => {
                AppError::NotFound
            }
            other => AppError::Sqlx(other),
        })?;

    Ok((StatusCode::CREATED, Json(row_to_location(&row))))
}

async fn upsert_primary(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<LocationInput>,
) -> Result<Json<Value>, AppError> {
    let blur_expr = if body.blur.unwrap_or(false) {
        "ST_SnapToGrid(ST_MakePoint($2,$3), 0.005)::geography"
    } else {
        "NULL"
    };

    let upd_sql = format!(
        "UPDATE contact_location
            SET geom = ST_MakePoint($2,$3)::geography,
                geom_blurred = {blur_expr},
                kind = COALESCE($4, kind),
                address = COALESCE($5, address)
          WHERE contact_id=$1 AND is_primary=true
          RETURNING id, kind, address, is_primary,
                    ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat"
    );

    if let Some(row) = sqlx::query(&upd_sql)
        .bind(&contact_id)
        .bind(body.lng)
        .bind(body.lat)
        .bind(&body.kind)
        .bind(&body.address)
        .fetch_optional(&pool)
        .await?
    {
        return Ok(Json(row_to_location(&row)));
    }

    let ins_sql = format!(
        "INSERT INTO contact_location (contact_id, kind, address, is_primary, geom, geom_blurred)
         VALUES ($1, COALESCE($4,'principal'), $5, true, ST_MakePoint($2,$3)::geography, {blur_expr})
         RETURNING id, kind, address, is_primary,
                   ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat"
    );

    let row = sqlx::query(&ins_sql)
        .bind(&contact_id)
        .bind(body.lng)
        .bind(body.lat)
        .bind(&body.kind)
        .bind(&body.address)
        .fetch_one(&pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref d) if d.code().as_deref() == Some("23503") => {
                AppError::NotFound
            }
            other => AppError::Sqlx(other),
        })?;

    Ok(Json(row_to_location(&row)))
}

async fn remove_location(
    State(pool): State<PgPool>,
    Path((contact_id, loc_id)): Path<(String, i64)>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query(
        "DELETE FROM contact_location WHERE id=$1 AND contact_id=$2",
    )
    .bind(loc_id)
    .bind(&contact_id)
    .execute(&pool)
    .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
