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
struct Url {
    id: i64,
    contact_id: String,
    url: String,
    label: Option<String>,
}

#[derive(Deserialize)]
pub struct UrlInput {
    url: String,
    label: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/urls", get(list).post(create))
        .route("/urls/:id", delete(remove))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<Url> = sqlx::query_as(
        "SELECT id, contact_id, url, label FROM contact_url WHERE contact_id=$1 ORDER BY id",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<UrlInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let row: Url = sqlx::query_as(
        "INSERT INTO contact_url (contact_id, url, label) VALUES ($1,$2,$3)
         RETURNING id, contact_id, url, label",
    )
    .bind(&contact_id)
    .bind(&body.url)
    .bind(&body.label)
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
    let res = sqlx::query("DELETE FROM contact_url WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
