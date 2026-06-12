use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct MaritalStatus {
    status_id: String,
    marital_status: String,
}

#[derive(Serialize, sqlx::FromRow)]
struct RelationshipType {
    type_id: String,
    label: String,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/marital-statuses", get(list_marital_statuses))
        .route("/relationship-types", get(list_relationship_types))
}

async fn list_marital_statuses(
    State(pool): State<PgPool>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<MaritalStatus> = sqlx::query_as(
        "SELECT status_id, marital_status FROM marital_status ORDER BY marital_status",
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn list_relationship_types(
    State(pool): State<PgPool>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<RelationshipType> = sqlx::query_as(
        "SELECT type_id, label FROM relationship_type ORDER BY label",
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}
