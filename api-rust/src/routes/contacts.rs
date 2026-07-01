use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Serialize, sqlx::FromRow)]
struct ContactRow {
    contact_id: String,
    first_name: String,
    middle_name: Option<String>,
    surname: String,
    birthdate: Option<String>,
    gender: Option<String>,
    status_id: Option<String>,
    instagram_username: Option<String>,
    created_at: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct ContactListRow {
    contact_id: String,
    first_name: String,
    middle_name: Option<String>,
    surname: String,
    birthdate: Option<String>,
    gender: Option<String>,
    status_id: Option<String>,
    instagram_username: Option<String>,
    created_at: Option<String>,
    lng: Option<f64>,
    lat: Option<f64>,
    has_location: Option<bool>,
}

#[derive(Deserialize)]
pub struct ListQuery {
    q: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    order: Option<String>,
}

#[derive(Deserialize)]
pub struct InstagramPatch {
    instagram_username: Option<String>,
}

#[derive(Deserialize)]
pub struct ContactInput {
    first_name: String,
    middle_name: Option<String>,
    surname: String,
    birthdate: Option<String>,
    gender: Option<String>,
    status_id: Option<String>,
    instagram_username: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/contacts", get(list).post(create))
        .route("/contacts/:id", get(detail).put(update).patch(patch_update).delete(remove))
        .route("/contacts/:id/instagram", patch(patch_instagram))
        .route("/contacts/:id/family-tree", get(family_tree))
}

async fn list(
    State(pool): State<PgPool>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let limit = q.limit.unwrap_or(1000).min(1000);
    let offset = q.offset.unwrap_or(0);
    let order_dir = match q.order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    let rows: Vec<ContactListRow> = if let Some(search) = &q.q {
        let pattern = format!("%{search}%");
        let sql = format!(
            "SELECT c.contact_id, c.first_name, c.middle_name, c.surname, c.birthdate, c.gender, c.status_id,
                    c.instagram_username, c.created_at::text AS created_at,
                    l.lng, l.lat, (l.lng IS NOT NULL) AS has_location
               FROM contact c
               LEFT JOIN LATERAL (
                 SELECT ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat
                   FROM contact_location
                  WHERE contact_id = c.contact_id
                  ORDER BY is_primary DESC, id
                  LIMIT 1
               ) l ON true
              WHERE c.first_name ILIKE $1 OR c.surname ILIKE $1
              ORDER BY c.created_at {order_dir}
              LIMIT $2 OFFSET $3"
        );
        sqlx::query_as(&sql)
            .bind(pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await?
    } else {
        let sql = format!(
            "SELECT c.contact_id, c.first_name, c.middle_name, c.surname, c.birthdate, c.gender, c.status_id,
                    c.instagram_username, c.created_at::text AS created_at,
                    l.lng, l.lat, (l.lng IS NOT NULL) AS has_location
               FROM contact c
               LEFT JOIN LATERAL (
                 SELECT ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat
                   FROM contact_location
                  WHERE contact_id = c.contact_id
                  ORDER BY is_primary DESC, id
                  LIMIT 1
               ) l ON true
              ORDER BY c.created_at {order_dir}
              LIMIT $1 OFFSET $2"
        );
        sqlx::query_as(&sql)
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await?
    };

    Ok(Json(json!(rows)))
}

async fn create(
    State(pool): State<PgPool>,
    Json(body): Json<ContactInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let id = Uuid::new_v4().to_string();
    let row: ContactRow = sqlx::query_as(
        "INSERT INTO contact (contact_id, first_name, middle_name, surname, birthdate, gender, status_id, instagram_username)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING contact_id, first_name, middle_name, surname, birthdate, gender, status_id, instagram_username",
    )
    .bind(&id)
    .bind(&body.first_name)
    .bind(&body.middle_name)
    .bind(&body.surname)
    .bind(&body.birthdate)
    .bind(&body.gender)
    .bind(&body.status_id)
    .bind(&body.instagram_username)
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(json!(row))))
}

async fn detail(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let contact: ContactRow = sqlx::query_as(
        "SELECT contact_id, first_name, middle_name, surname, birthdate, gender, status_id, instagram_username, created_at::text AS created_at
            FROM contact WHERE contact_id = $1",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let (phones, emails, locations, traits) = tokio::join!(
        sqlx::query(
            "SELECT id, phone, label FROM contact_phone WHERE contact_id=$1 ORDER BY id"
        )
        .bind(&id)
        .fetch_all(&pool),
        sqlx::query(
            "SELECT id, email, label FROM contact_email WHERE contact_id=$1 ORDER BY id"
        )
        .bind(&id)
        .fetch_all(&pool),
        sqlx::query(
            "SELECT id, kind, address, is_primary,
                    ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat
               FROM contact_location WHERE contact_id=$1 ORDER BY is_primary DESC, id"
        )
        .bind(&id)
        .fetch_all(&pool),
        sqlx::query(
            "SELECT t.id AS trait_id, t.kind, t.label, t.color, ct.weight, ct.source
               FROM contact_trait ct JOIN trait t ON t.id=ct.trait_id
              WHERE ct.contact_id=$1 ORDER BY ct.weight DESC"
        )
        .bind(&id)
        .fetch_all(&pool),
    );

    let phones = phones?.iter().map(|r| json!({
        "id": r.get::<i64, _>("id"),
        "phone": r.get::<String, _>("phone"),
        "label": r.get::<Option<String>, _>("label"),
    })).collect::<Vec<_>>();

    let emails = emails?.iter().map(|r| json!({
        "id": r.get::<i64, _>("id"),
        "email": r.get::<String, _>("email"),
        "label": r.get::<Option<String>, _>("label"),
    })).collect::<Vec<_>>();

    let locations = locations?.iter().map(|r| json!({
        "id": r.get::<i64, _>("id"),
        "kind": r.get::<Option<String>, _>("kind"),
        "address": r.get::<Option<String>, _>("address"),
        "is_primary": r.get::<bool, _>("is_primary"),
        "lng": r.get::<Option<f64>, _>("lng"),
        "lat": r.get::<Option<f64>, _>("lat"),
    })).collect::<Vec<_>>();

    let traits = traits?.iter().map(|r| json!({
        "trait_id": r.get::<i64, _>("trait_id"),
        "kind": r.get::<String, _>("kind"),
        "label": r.get::<String, _>("label"),
        "color": r.get::<String, _>("color"),
        "weight": r.get::<f32, _>("weight"),
        "source": r.get::<Option<String>, _>("source"),
    })).collect::<Vec<_>>();

    Ok(Json(json!({
        "contact_id": contact.contact_id,
        "first_name": contact.first_name,
        "middle_name": contact.middle_name,
        "surname": contact.surname,
        "birthdate": contact.birthdate,
        "gender": contact.gender,
        "status_id": contact.status_id,
        "instagram_username": contact.instagram_username,
        "created_at": contact.created_at,
        "phones": phones,
        "emails": emails,
        "locations": locations,
        "traits": traits,
    })))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
    Json(body): Json<ContactInput>,
) -> Result<Json<Value>, AppError> {
    let row: ContactRow = sqlx::query_as(
        "UPDATE contact
            SET first_name=$2, middle_name=$3, surname=$4,
                birthdate=$5, gender=$6, status_id=$7, instagram_username=$8
          WHERE contact_id=$1
         RETURNING contact_id, first_name, middle_name, surname, birthdate, gender, status_id, instagram_username, created_at::text AS created_at",
    )
    .bind(&id)
    .bind(&body.first_name)
    .bind(&body.middle_name)
    .bind(&body.surname)
    .bind(&body.birthdate)
    .bind(&body.gender)
    .bind(&body.status_id)
    .bind(&body.instagram_username)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(json!(row)))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM contact WHERE contact_id=$1")
        .bind(&id)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn patch_update(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<StatusCode, AppError> {
    if let Some(Value::String(s)) = body.get("first_name") {
        if s.trim().is_empty() {
            return Err(AppError::BadRequest("first_name no puede estar vacío".into()));
        }
    }
    if let Some(Value::String(s)) = body.get("surname") {
        if s.trim().is_empty() {
            return Err(AppError::BadRequest("surname no puede estar vacío".into()));
        }
    }

    let sql = r#"
        UPDATE contact SET
            first_name  = CASE WHEN ($2::jsonb ? 'first_name')  THEN trim(($2::jsonb ->> 'first_name')::text) ELSE first_name END,
            middle_name = CASE WHEN ($2::jsonb ? 'middle_name') THEN NULLIF(trim(($2::jsonb ->> 'middle_name')::text), '') ELSE middle_name END,
            surname     = CASE WHEN ($2::jsonb ? 'surname')     THEN trim(($2::jsonb ->> 'surname')::text) ELSE surname END,
            birthdate   = CASE WHEN ($2::jsonb ? 'birthdate')   THEN ($2::jsonb ->> 'birthdate')::text ELSE birthdate END,
            gender      = CASE WHEN ($2::jsonb ? 'gender')      THEN ($2::jsonb ->> 'gender')::text ELSE gender END,
            status_id   = CASE WHEN ($2::jsonb ? 'status_id')   THEN ($2::jsonb ->> 'status_id')::text ELSE status_id END
        WHERE contact_id = $1
    "#;

    let res = sqlx::query(sql)
        .bind(&id)
        .bind(&body)
        .execute(&pool)
        .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

#[derive(Deserialize)]
pub struct FamilyTreeQuery {
    depth: Option<i32>,
}

async fn family_tree(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
    Query(q): Query<FamilyTreeQuery>,
) -> Result<Json<Value>, AppError> {
    let depth = q.depth.unwrap_or(4).min(6);

    let exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM contact WHERE contact_id=$1)",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;
    if !exists.0 {
        return Err(AppError::NotFound);
    }

    let contact_ids: Vec<(String,)> = sqlx::query_as(
        r#"WITH RECURSIVE family(id, path) AS (
            SELECT $1::text, ARRAY[$1::text]
            UNION ALL
            SELECT n.neighbor, f.path || n.neighbor
            FROM family f,
            LATERAL (
                SELECT related_contact_id AS neighbor
                FROM contact_relationship WHERE contact_id = f.id
                UNION ALL
                SELECT contact_id AS neighbor
                FROM contact_relationship WHERE related_contact_id = f.id
            ) n
            WHERE NOT n.neighbor = ANY(f.path)
              AND array_length(f.path, 1) <= $2
        )
        SELECT DISTINCT id FROM family"#,
    )
    .bind(&id)
    .bind(depth + 1)
    .fetch_all(&pool)
    .await?;

    let ids: Vec<&str> = contact_ids.iter().map(|r| r.0.as_str()).collect();

    let node_rows = sqlx::query(
        r#"SELECT c.contact_id, c.first_name, c.middle_name, c.surname, c.gender,
                  EXISTS(SELECT 1 FROM contact_location l WHERE l.contact_id=c.contact_id) AS has_location
             FROM contact c WHERE c.contact_id = ANY($1)"#,
    )
    .bind(&ids)
    .fetch_all(&pool)
    .await?;

    let nodes: Vec<Value> = node_rows.iter().map(|r| json!({
        "contact_id": r.get::<String, _>("contact_id"),
        "first_name": r.get::<String, _>("first_name"),
        "middle_name": r.get::<Option<String>, _>("middle_name"),
        "surname": r.get::<String, _>("surname"),
        "gender": r.get::<Option<String>, _>("gender"),
        "has_location": r.get::<bool, _>("has_location"),
    })).collect();

    let edge_rows = sqlx::query(
        r#"SELECT cr.id, cr.contact_id AS source, cr.related_contact_id AS target,
                  cr.type_id, rt.label
             FROM contact_relationship cr
             JOIN relationship_type rt ON rt.type_id = cr.type_id
            WHERE cr.contact_id = ANY($1)
              AND cr.related_contact_id = ANY($1)
              AND (
                cr.type_id IN ('padre','madre','abuelo','abuela','tio','tia')
                OR
                (cr.type_id IN ('conyuge','hermano','hermana','primo','prima')
                 AND cr.contact_id < cr.related_contact_id)
              )"#,
    )
    .bind(&ids)
    .fetch_all(&pool)
    .await?;

    let edges: Vec<Value> = edge_rows.iter().map(|r| json!({
        "id": r.get::<i64, _>("id"),
        "source": r.get::<String, _>("source"),
        "target": r.get::<String, _>("target"),
        "type_id": r.get::<String, _>("type_id"),
        "label": r.get::<String, _>("label"),
    })).collect();

    Ok(Json(json!({
        "root_id": id,
        "nodes": nodes,
        "edges": edges,
    })))
}

async fn patch_instagram(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
    Json(body): Json<InstagramPatch>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query(
        "UPDATE contact SET instagram_username=$2 WHERE contact_id=$1",
    )
    .bind(&id)
    .bind(&body.instagram_username)
    .execute(&pool)
    .await?;

    if res.rows_affected() == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
