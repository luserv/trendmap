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
struct IdentityCard {
    id: i64,
    contact_id: String,
    doc_type: String,
    card_number: String,
    issue_date: Option<String>,
    expiry_date: Option<String>,
}

#[derive(Deserialize)]
pub struct IdentityCardInput {
    doc_type: String,
    card_number: String,
    issue_date: Option<String>,
    expiry_date: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/identity-cards", get(list).post(create))
        .route("/identity-cards/:id", put(update).delete(remove))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<IdentityCard> = sqlx::query_as(
        "SELECT id, contact_id, doc_type, card_number, issue_date, expiry_date
           FROM national_identity_card WHERE contact_id=$1 ORDER BY id",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<IdentityCardInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let row: IdentityCard = sqlx::query_as(
        "INSERT INTO national_identity_card (contact_id, doc_type, card_number, issue_date, expiry_date)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, contact_id, doc_type, card_number, issue_date, expiry_date",
    )
    .bind(&contact_id)
    .bind(&body.doc_type)
    .bind(&body.card_number)
    .bind(&body.issue_date)
    .bind(&body.expiry_date)
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
    Json(body): Json<IdentityCardInput>,
) -> Result<Json<Value>, AppError> {
    let row: IdentityCard = sqlx::query_as(
        "UPDATE national_identity_card
            SET doc_type=$2, card_number=$3, issue_date=$4, expiry_date=$5
          WHERE id=$1
          RETURNING id, contact_id, doc_type, card_number, issue_date, expiry_date",
    )
    .bind(id)
    .bind(&body.doc_type)
    .bind(&body.card_number)
    .bind(&body.issue_date)
    .bind(&body.expiry_date)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!(row)))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM national_identity_card WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
