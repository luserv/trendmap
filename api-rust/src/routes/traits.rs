use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use crate::error::AppError;

#[derive(Deserialize)]
pub struct TraitFilter {
    kind: Option<String>,
}

#[derive(Deserialize)]
pub struct TraitInput {
    kind: Option<String>,
    label: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
pub struct ContactTraitInput {
    trait_id: Option<i64>,
    kind: Option<String>,
    label: Option<String>,
    weight: Option<f32>,
    source: Option<String>,
    color: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/traits", get(list_traits).post(create_trait))
        .route("/traits/:id", patch(update_trait).delete(remove_trait_from_catalog))
        .route("/contacts/:id/traits", post(assign_trait))
        .route("/contacts/:id/traits/:trait_id", delete(remove_trait))
}

async fn list_traits(
    State(pool): State<PgPool>,
    Query(q): Query<TraitFilter>,
) -> Result<Json<Value>, AppError> {
    let rows = if let Some(kind) = &q.kind {
        sqlx::query(
            "SELECT t.id, t.kind, t.label, t.color, count(ct.contact_id)::int AS contacts
               FROM trait t
               LEFT JOIN contact_trait ct ON ct.trait_id=t.id
              WHERE t.kind=$1
              GROUP BY t.id ORDER BY t.kind, t.label",
        )
        .bind(kind)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query(
            "SELECT t.id, t.kind, t.label, t.color, count(ct.contact_id)::int AS contacts
               FROM trait t
               LEFT JOIN contact_trait ct ON ct.trait_id=t.id
              GROUP BY t.id ORDER BY t.kind, t.label",
        )
        .fetch_all(&pool)
        .await?
    };

    let result: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<i64, _>("id"),
        "kind": r.get::<String, _>("kind"),
        "label": r.get::<String, _>("label"),
        "color": r.get::<String, _>("color"),
        "contacts": r.get::<i32, _>("contacts"),
    })).collect();

    Ok(Json(json!(result)))
}

async fn create_trait(
    State(pool): State<PgPool>,
    Json(body): Json<TraitInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let (kind, label) = match (&body.kind, &body.label) {
        (Some(k), Some(l)) => (k.clone(), l.clone()),
        _ => return Err(AppError::BadRequest("kind y label requeridos".into())),
    };

    let row = sqlx::query(
        "INSERT INTO trait (kind,label,color) VALUES ($1,$2,COALESCE($3,'#38bdf8'))
         ON CONFLICT (kind,label) DO UPDATE SET label=EXCLUDED.label
         RETURNING id, kind, label, color",
    )
    .bind(&kind)
    .bind(&label)
    .bind(&body.color)
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!({
        "id": row.get::<i64, _>("id"),
        "kind": row.get::<String, _>("kind"),
        "label": row.get::<String, _>("label"),
        "color": row.get::<String, _>("color"),
    }))))
}

async fn update_trait(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
    Json(body): Json<TraitInput>,
) -> Result<Json<Value>, AppError> {
    if body.color.is_none() && body.label.is_none() {
        return Err(AppError::BadRequest("color o label requeridos".into()));
    }

    let row = sqlx::query(
        "UPDATE trait SET color=COALESCE($2,color), label=COALESCE($3,label)
          WHERE id=$1
          RETURNING id, kind, label, color",
    )
    .bind(id)
    .bind(&body.color)
    .bind(&body.label)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!({
        "id": row.get::<i64, _>("id"),
        "kind": row.get::<String, _>("kind"),
        "label": row.get::<String, _>("label"),
        "color": row.get::<String, _>("color"),
    })))
}

async fn assign_trait(
    State(pool): State<PgPool>,
    Path(contact_id): Path<String>,
    Json(body): Json<ContactTraitInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let trait_id = if let Some(id) = body.trait_id {
        id
    } else {
        let (kind, label) = match (&body.kind, &body.label) {
            (Some(k), Some(l)) => (k, l),
            _ => return Err(AppError::BadRequest("trait_id, o kind+label requeridos".into())),
        };
        let row = sqlx::query(
            "INSERT INTO trait (kind,label,color) VALUES ($1,$2,COALESCE($3,'#38bdf8'))
             ON CONFLICT (kind,label) DO UPDATE SET label=EXCLUDED.label
             RETURNING id",
        )
        .bind(kind)
        .bind(label)
        .bind(&body.color)
        .fetch_one(&pool)
        .await?;
        row.try_get::<i64, _>("id")?
    };

    let row = sqlx::query(
        "INSERT INTO contact_trait (contact_id, trait_id, weight, source)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (contact_id, trait_id)
           DO UPDATE SET weight=EXCLUDED.weight, source=EXCLUDED.source, updated_at=now()
         RETURNING contact_id, trait_id, weight, source",
    )
    .bind(&contact_id)
    .bind(trait_id)
    .bind(body.weight.unwrap_or(1.0))
    .bind(&body.source)
    .fetch_one(&pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref d) if d.code().as_deref() == Some("23503") => AppError::NotFound,
        other => AppError::Sqlx(other),
    })?;

    Ok((StatusCode::CREATED, Json(json!({
        "contact_id": row.get::<String, _>("contact_id"),
        "trait_id": row.get::<i64, _>("trait_id"),
        "weight": row.get::<f32, _>("weight"),
        "source": row.get::<Option<String>, _>("source"),
    }))))
}

async fn remove_trait_from_catalog(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM trait WHERE id=$1")
        .bind(id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn remove_trait(
    State(pool): State<PgPool>,
    Path((contact_id, trait_id)): Path<(String, i64)>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query(
        "DELETE FROM contact_trait WHERE contact_id=$1 AND trait_id=$2",
    )
    .bind(&contact_id)
    .bind(trait_id)
    .execute(&pool)
    .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
