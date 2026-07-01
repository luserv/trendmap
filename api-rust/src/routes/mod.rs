use axum::{extract::State, routing::get, Json, Router};
use sqlx::PgPool;

pub mod bank_accounts;
pub mod catalogs;
pub mod contacts;
pub mod emails;
pub mod geo;
pub mod identity_cards;
pub mod keywords;
pub mod locations;
pub mod notes;
pub mod organizations;
pub mod phones;
pub mod relationships;
pub mod traits;
pub mod urls;
pub mod zones;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/health", get(health))
        .merge(contacts::router())
        .merge(phones::router())
        .merge(emails::router())
        .merge(urls::router())
        .merge(notes::router())
        .merge(keywords::router())
        .merge(bank_accounts::router())
        .merge(identity_cards::router())
        .merge(relationships::router())
        .merge(organizations::router())
        .merge(locations::router())
        .merge(traits::router())
        .merge(geo::router())
        .merge(catalogs::router())
        .merge(zones::router())
        .with_state(pool)
}

async fn health(State(pool): State<PgPool>) -> Json<serde_json::Value> {
    let row: (i32, String) = sqlx::query_as("SELECT 1, postgis_version()")
        .fetch_one(&pool)
        .await
        .unwrap();
    Json(serde_json::json!({ "ok": true, "postgis": row.1 }))
}
