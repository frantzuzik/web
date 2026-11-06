# Cook Book

Кулинарная книга: каталог рецептов. Frontend — HTML/CSS/JS, backend — FastAPI + SQLAlchemy (SQLite по умолчанию).

## Сущности

- **Recipe** (`recipes`): `id`, `name`, `description`, `time_minutes`, `difficulty`, `image_url`, `cuisine_id` (FK), `created_at`.
- **Cuisine** (`cuisines`): `id`, `name` (UNIQUE).

Ограничения: `NOT NULL`, `UNIQUE` на `cuisines.name`, `CHECK` на `time_minutes` (1–600) и `difficulty`, `FOREIGN KEY` `recipes.cuisine_id → cuisines.id`.

## API

| Метод | Путь |
|---|---|
| GET | `/api/recipes` |
| POST | `/api/recipes` |
| GET | `/api/recipes/{id}` |
| PATCH | `/api/recipes/{id}` |
| DELETE | `/api/recipes/{id}` |
| GET | `/api/cuisines` |
| GET | `/api/health` |

## Запуск

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
