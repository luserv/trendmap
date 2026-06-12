use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct ContactOrg {
    id: i64,
    contact_id: String,
    organization_id: String,
    organization_name: String,
    achievement: String,
    date: Option<String>,
}

#[derive(Deserialize)]
pub struct ContactOrgInput {
    org_name: String,
    achievement: String,
    date: Option<String>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts/:id/organizations", get(list).post(create))
        .route("/contact-organizations/:id", put(update).delete(remove))
        .route("/organizations/search", get(search_orgs))
        .route("/organizations/achievements/search", get(search_achievements))
}

async fn list(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let rows: Vec<ContactOrg> = sqlx::query_as(
        "SELECT co.id, co.contact_id, co.organization_id, o.name AS organization_name,
                co.achievement, co.date
           FROM contact_organization co
           JOIN organization o ON o.organization_id = co.organization_id
          WHERE co.contact_id = $1
          ORDER BY co.id",
    )
    .bind(&contact_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<ContactOrgInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    // find-or-create organization by name
    let org_id: String = {
        let existing = sqlx::query(
            "SELECT organization_id FROM organization WHERE name = $1",
        )
        .bind(&body.org_name)
        .fetch_optional(&pool)
        .await?;

        if let Some(row) = existing {
            row.try_get("organization_id")?
        } else {
            let new_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO organization (organization_id, name) VALUES ($1,$2)
                 ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name
                 RETURNING organization_id",
            )
            .bind(&new_id)
            .bind(&body.org_name)
            .fetch_one(&pool)
            .await?
            .try_get("organization_id")?
        }
    };

    let row: ContactOrg = sqlx::query_as(
        "INSERT INTO contact_organization (contact_id, organization_id, achievement, date)
         VALUES ($1,$2,$3,$4)
         RETURNING id, contact_id, organization_id,
                   (SELECT name FROM organization WHERE organization_id=$2) AS organization_name,
                   achievement, date",
    )
    .bind(&contact_id)
    .bind(&org_id)
    .bind(&body.achievement)
    .bind(&body.date)
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
    Json(body): Json<ContactOrgInput>,
) -> Result<Json<Value>, AppError> {
    let org_id: String = {
        let new_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO organization (organization_id, name) VALUES ($1,$2)
             ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name
             RETURNING organization_id",
        )
        .bind(&new_id)
        .bind(&body.org_name)
        .fetch_one(&pool)
        .await?
        .try_get("organization_id")?
    };

    let row: ContactOrg = sqlx::query_as(
        "UPDATE contact_organization
            SET organization_id=$2, achievement=$3, date=$4
          WHERE id=$1
          RETURNING id, contact_id, organization_id,
                    (SELECT name FROM organization WHERE organization_id=$2) AS organization_name,
                    achievement, date",
    )
    .bind(id)
    .bind(&org_id)
    .bind(&body.achievement)
    .bind(&body.date)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!(row)))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM contact_organization WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn search_orgs(
    State(pool): State<PgPool>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let pattern = format!("%{}%", q.q.as_deref().unwrap_or(""));
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT organization_id, name FROM organization WHERE name ILIKE $1 ORDER BY name LIMIT 20",
    )
    .bind(pattern)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows.into_iter().map(|(id, name)| json!({"organization_id": id, "name": name})).collect::<Vec<_>>())))
}

async fn search_achievements(
    State(pool): State<PgPool>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let pattern = format!("%{}%", q.q.as_deref().unwrap_or(""));
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT achievement FROM contact_organization
          WHERE achievement ILIKE $1 ORDER BY achievement LIMIT 20",
    )
    .bind(pattern)
    .fetch_all(&pool)
    .await?;

    Ok(Json(json!(rows.into_iter().map(|r| r.0).collect::<Vec<_>>())))
}
