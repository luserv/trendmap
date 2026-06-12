use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn create_pool() -> PgPool {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgPoolOptions::new()
        .max_connections(10)
        .connect(&url)
        .await
        .expect("failed to connect to postgres")
}
