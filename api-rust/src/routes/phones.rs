use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct Phone {
    id: i64,
    contact_id: String,
    phone: String,
    label: Option<String>,
}

#[derive(Deserialize)]
pub struct PhoneInput {
    phone: String,
    label: Option<String>,
}

#[derive(Deserialize)]
pub struct PhoneUpdate {
    phone: String,
    label: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/phones", get(list).post(create))
        .route("/phones/:id", put(update).delete(remove))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<Phone> = sqlx::query_as(
        "SELECT id, contact_id, phone, label FROM contact_phone WHERE contact_id=$1 ORDER BY id",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<PhoneInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let row: Phone = sqlx::query_as(
        "INSERT INTO contact_phone (contact_id, phone, label) VALUES ($1,$2,$3)
         RETURNING id, contact_id, phone, label",
    )
    .bind(&contact_id)
    .bind(&body.phone)
    .bind(&body.label)
    .fetch_one(&pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref d) if d.code().as_deref() == Some("23503") => AppError::NotFound,
        other => AppError::Sqlx(other),
    })?;

    Ok((StatusCode::CREATED, Json(json!(row))))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
    Json(body): Json<PhoneUpdate>,
) -> Result<Json<Value>, AppError> {
    let row: Phone = sqlx::query_as(
        "UPDATE contact_phone SET phone=$2, label=$3 WHERE id=$1
         RETURNING id, contact_id, phone, label",
    )
    .bind(id)
    .bind(&body.phone)
    .bind(&body.label)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!(row)))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM contact_phone WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
