use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct BankAccount {
    id: i64,
    contact_id: String,
    bank_name: Option<String>,
    account_number: String,
    account_type: Option<String>,
    label: Option<String>,
}

#[derive(Deserialize)]
pub struct BankAccountInput {
    account_number: String,
    bank_name: Option<String>,
    account_type: Option<String>,
    label: Option<String>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/bank-accounts", get(list).post(create))
        .route("/bank-accounts/:id", put(update).delete(remove))
        .route("/bank-accounts/search/banks", get(search_banks))
        .route("/bank-accounts/search/types", get(search_types))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<BankAccount> = sqlx::query_as(
        "SELECT id, contact_id, bank_name, account_number, account_type, label
           FROM contact_bank_account WHERE contact_id=$1 ORDER BY id",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<BankAccountInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let row: BankAccount = sqlx::query_as(
        "INSERT INTO contact_bank_account (contact_id, bank_name, account_number, account_type, label)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, contact_id, bank_name, account_number, account_type, label",
    )
    .bind(&contact_id)
    .bind(&body.bank_name)
    .bind(&body.account_number)
    .bind(&body.account_type)
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
    Json(body): Json<BankAccountInput>,
) -> Result<Json<Value>, AppError> {
    let row: BankAccount = sqlx::query_as(
        "UPDATE contact_bank_account
            SET bank_name=$2, account_number=$3, account_type=$4, label=$5
          WHERE id=$1
          RETURNING id, contact_id, bank_name, account_number, account_type, label",
    )
    .bind(id)
    .bind(&body.bank_name)
    .bind(&body.account_number)
    .bind(&body.account_type)
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
    let res = sqlx::query("DELETE FROM contact_bank_account WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn search_banks(
    State(pool): State<PgPool>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let pattern = format!("%{}%", q.q.as_deref().unwrap_or(""));
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT bank_name FROM contact_bank_account
          WHERE bank_name IS NOT NULL AND bank_name ILIKE $1
          ORDER BY bank_name LIMIT 20",
    )
    .bind(pattern)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows.into_iter().map(|r| r.0).collect::<Vec<_>>())))
}

async fn search_types(
    State(pool): State<PgPool>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let pattern = format!("%{}%", q.q.as_deref().unwrap_or(""));
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT account_type FROM contact_bank_account
          WHERE account_type IS NOT NULL AND account_type ILIKE $1
          ORDER BY account_type LIMIT 20",
    )
    .bind(pattern)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows.into_iter().map(|r| r.0).collect::<Vec<_>>())))
}
