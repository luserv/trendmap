use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct Relationship {
    id: i64,
    related_contact_id: String,
    type_id: String,
    label: String,
    first_name: String,
    surname: String,
}

#[derive(Deserialize)]
pub struct RelationshipInput {
    related_contact_id: String,
    type_id: String,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/relationships", get(list).post(create))
        .route("/relationships/:id", get(detail).delete(remove))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<Relationship> = sqlx::query_as(
        "SELECT cr.id, cr.related_contact_id, cr.type_id, rt.label,
                rc.first_name, rc.surname
           FROM contact_relationship cr
           JOIN relationship_type rt ON rt.type_id = cr.type_id
           JOIN contact rc ON rc.contact_id = cr.related_contact_id
          WHERE cr.contact_id = $1
          ORDER BY cr.id",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn detail(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let row = sqlx::query(
        "SELECT cr.id, cr.contact_id, cr.related_contact_id, cr.type_id,
                c.gender AS contact_gender
           FROM contact_relationship cr
           JOIN contact c ON c.contact_id = cr.contact_id
          WHERE cr.id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!({
        "id":                  row.get::<i64, _>("id"),
        "contact_id":          row.get::<String, _>("contact_id"),
        "related_contact_id":  row.get::<String, _>("related_contact_id"),
        "type_id":             row.get::<String, _>("type_id"),
        "contact_gender":      row.get::<Option<String>, _>("contact_gender"),
    })))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<RelationshipInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let row = sqlx::query(
        "INSERT INTO contact_relationship (contact_id, related_contact_id, type_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (contact_id, related_contact_id, type_id) DO NOTHING
         RETURNING id",
    )
    .bind(&contact_id)
    .bind(&body.related_contact_id)
    .bind(&body.type_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref d) if d.code().as_deref() == Some("23503") => AppError::NotFound,
        other => AppError::Sqlx(other),
    })?;

    match row {
        Some(r) => Ok((StatusCode::CREATED, Json(json!({ "id": r.get::<i64, _>("id") })))),
        None => Ok((StatusCode::OK, Json(json!({ "message": "ya existía" })))),
    }
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM contact_relationship WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
