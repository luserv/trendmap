use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::error::AppError;

#[derive(Deserialize)]
pub struct LocationsQuery {
    bbox: Option<String>,
    blurred: Option<String>,
}

#[derive(Deserialize)]
pub struct NearbyQuery {
    lng: Option<f64>,
    lat: Option<f64>,
    radius: Option<f64>,
    trait_label: Option<String>,
}

#[derive(Deserialize)]
pub struct TrendsQuery {
    lng: Option<f64>,
    lat: Option<f64>,
    radius: Option<f64>,
    kind: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/geo/locations", get(locations))
        .route("/geo/nearby", get(nearby))
        .route("/geo/trends", get(trends))
}

async fn locations(
    State(pool): State<PgPool>,
    Query(q): Query<LocationsQuery>,
) -> Result<Json<Value>, AppError> {
    let blurred = q.blurred.as_deref() == Some("true");
    let geom_col = if blurred {
        "COALESCE(l.geom_blurred, l.geom)"
    } else {
        "l.geom"
    };

    let sql = if let Some(bbox) = &q.bbox {
        let parts: Vec<f64> = bbox.split(',').filter_map(|s| s.parse().ok()).collect();
        if parts.len() != 4 {
            return Err(AppError::BadRequest("bbox: minLng,minLat,maxLng,maxLat".into()));
        }

        let sql = format!(
            "SELECT json_build_object(
               'type','FeatureCollection',
               'features', COALESCE(json_agg(json_build_object(
                  'type','Feature',
                  'geometry', ST_AsGeoJSON({geom_col})::json,
                  'properties', json_build_object(
                     'location_id', l.id,
                     'contact_id', c.contact_id,
                     'name', c.first_name || ' ' || c.surname,
                     'kind', l.kind,
                     'color', COALESCE(tt.color,'#4ade80'),
                     'trait', tt.label
                  ))), '[]'::json)
             ) AS geojson
             FROM contact_location l
             JOIN contact c ON c.contact_id=l.contact_id
             LEFT JOIN LATERAL (
               SELECT t.color, t.label FROM contact_trait ct JOIN trait t ON t.id=ct.trait_id
                WHERE ct.contact_id=c.contact_id ORDER BY ct.weight DESC LIMIT 1
             ) tt ON true
             WHERE {geom_col} && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography"
        );

        let row = sqlx::query(&sql)
            .bind(parts[0]).bind(parts[1]).bind(parts[2]).bind(parts[3])
            .fetch_one(&pool)
            .await?;

        let geojson: Value = row.try_get("geojson")?;
        return Ok(Json(geojson));
    } else {
        format!(
            "SELECT json_build_object(
               'type','FeatureCollection',
               'features', COALESCE(json_agg(json_build_object(
                  'type','Feature',
                  'geometry', ST_AsGeoJSON({geom_col})::json,
                  'properties', json_build_object(
                     'location_id', l.id,
                     'contact_id', c.contact_id,
                     'name', c.first_name || ' ' || c.surname,
                     'kind', l.kind,
                     'color', COALESCE(tt.color,'#4ade80'),
                     'trait', tt.label
                  ))), '[]'::json)
             ) AS geojson
             FROM contact_location l
             JOIN contact c ON c.contact_id=l.contact_id
             LEFT JOIN LATERAL (
               SELECT t.color, t.label FROM contact_trait ct JOIN trait t ON t.id=ct.trait_id
                WHERE ct.contact_id=c.contact_id ORDER BY ct.weight DESC LIMIT 1
             ) tt ON true"
        )
    };

    let row = sqlx::query(&sql).fetch_one(&pool).await?;
    let geojson: Value = row.try_get("geojson")?;
    Ok(Json(geojson))
}

async fn nearby(
    State(pool): State<PgPool>,
    Query(q): Query<NearbyQuery>,
) -> Result<Json<Value>, AppError> {
    let (lng, lat) = match (q.lng, q.lat) {
        (Some(lng), Some(lat)) => (lng, lat),
        _ => return Err(AppError::BadRequest("lng y lat requeridos".into())),
    };
    let radius = q.radius.unwrap_or(5000.0);

    let row = if let Some(trait_label) = &q.trait_label {
        sqlx::query(
            "SELECT json_build_object(
               'type','FeatureCollection',
               'features', COALESCE(json_agg(DISTINCT jsonb_build_object(
                  'type','Feature',
                  'geometry', ST_AsGeoJSON(l.geom)::jsonb,
                  'properties', jsonb_build_object(
                     'contact_id', c.contact_id,
                     'name', c.first_name || ' ' || c.surname,
                     'meters', round(ST_Distance(l.geom, ST_MakePoint($1,$2)::geography)::numeric,1)
                  ))), '[]'::json)
             ) AS geojson
             FROM contact_location l
             JOIN contact c ON c.contact_id=l.contact_id
             JOIN contact_trait ct ON ct.contact_id=c.contact_id
             JOIN trait t ON t.id=ct.trait_id
             WHERE ST_DWithin(l.geom, ST_MakePoint($1,$2)::geography, $3) AND t.label=$4",
        )
        .bind(lng).bind(lat).bind(radius).bind(trait_label)
        .fetch_one(&pool)
        .await?
    } else {
        sqlx::query(
            "SELECT json_build_object(
               'type','FeatureCollection',
               'features', COALESCE(json_agg(DISTINCT jsonb_build_object(
                  'type','Feature',
                  'geometry', ST_AsGeoJSON(l.geom)::jsonb,
                  'properties', jsonb_build_object(
                     'contact_id', c.contact_id,
                     'name', c.first_name || ' ' || c.surname,
                     'meters', round(ST_Distance(l.geom, ST_MakePoint($1,$2)::geography)::numeric,1)
                  ))), '[]'::json)
             ) AS geojson
             FROM contact_location l
             JOIN contact c ON c.contact_id=l.contact_id
             WHERE ST_DWithin(l.geom, ST_MakePoint($1,$2)::geography, $3)",
        )
        .bind(lng).bind(lat).bind(radius)
        .fetch_one(&pool)
        .await?
    };

    let geojson: Value = row.try_get("geojson")?;
    Ok(Json(geojson))
}

async fn trends(
    State(pool): State<PgPool>,
    Query(q): Query<TrendsQuery>,
) -> Result<Json<Value>, AppError> {
    let (lng, lat) = match (q.lng, q.lat) {
        (Some(lng), Some(lat)) => (lng, lat),
        _ => return Err(AppError::BadRequest("lng y lat requeridos".into())),
    };
    let radius = q.radius.unwrap_or(5000.0);

    let rows = if let Some(kind) = &q.kind {
        sqlx::query(
            "SELECT t.kind, t.label, t.color,
                    count(DISTINCT c.contact_id)::int AS contacts,
                    round(sum(ct.weight)::numeric, 2)::float8 AS total_weight
               FROM contact_location l
               JOIN contact c ON c.contact_id=l.contact_id
               JOIN contact_trait ct ON ct.contact_id=c.contact_id
               JOIN trait t ON t.id=ct.trait_id
              WHERE ST_DWithin(l.geom, ST_MakePoint($1,$2)::geography, $3) AND t.kind=$4
              GROUP BY t.kind, t.label, t.color
              ORDER BY contacts DESC, total_weight DESC",
        )
        .bind(lng).bind(lat).bind(radius).bind(kind)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query(
            "SELECT t.kind, t.label, t.color,
                    count(DISTINCT c.contact_id)::int AS contacts,
                    round(sum(ct.weight)::numeric, 2)::float8 AS total_weight
               FROM contact_location l
               JOIN contact c ON c.contact_id=l.contact_id
               JOIN contact_trait ct ON ct.contact_id=c.contact_id
               JOIN trait t ON t.id=ct.trait_id
              WHERE ST_DWithin(l.geom, ST_MakePoint($1,$2)::geography, $3)
              GROUP BY t.kind, t.label, t.color
              ORDER BY contacts DESC, total_weight DESC",
        )
        .bind(lng).bind(lat).bind(radius)
        .fetch_all(&pool)
        .await?
    };

    let trends: Vec<Value> = rows.iter().map(|r| json!({
        "kind": r.get::<String, _>("kind"),
        "label": r.get::<String, _>("label"),
        "color": r.get::<String, _>("color"),
        "contacts": r.get::<i32, _>("contacts"),
        "total_weight": r.get::<f64, _>("total_weight"),
    })).collect();

    Ok(Json(json!({ "center": { "lng": lng, "lat": lat }, "radius": radius, "trends": trends })))
}
