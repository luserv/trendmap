use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct Keyword {
    id: i64,
    contact_id: String,
    keyword: String,
}

#[derive(Deserialize)]
pub struct KeywordInput {
    keyword: String,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/keywords", get(list).post(create))
        .route("/keywords/:id", delete(remove))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<Keyword> = sqlx::query_as(
        "SELECT id, contact_id, keyword FROM contact_keyword WHERE contact_id=$1 ORDER BY keyword",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<KeywordInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let row: Keyword = sqlx::query_as(
        "INSERT INTO contact_keyword (contact_id, keyword) VALUES ($1,$2)
         ON CONFLICT (contact_id, keyword) DO UPDATE SET keyword=EXCLUDED.keyword
         RETURNING id, contact_id, keyword",
    )
    .bind(&contact_id)
    .bind(&body.keyword)
    .fetch_one(&pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref d) if d.code().as_deref() == Some("23503") => AppError::NotFound,
        other => AppError::Sqlx(other),
    })?;

    Ok((StatusCode::CREATED, Json(json!(row))))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM contact_keyword WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
