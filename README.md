# Cook Book

Веб-приложение кулинарной книги: каталог рецептов + форма добавления, редактирования и удаления. 
Клиент-серверная архитектура.

## Структура проекта

- `index.html` — главная страница
- `css/style.css` — стили
- `js/app.js` — фронтенд-логика (Fetch API, State-Driven UI)
- `backend/main.py` — весь backend (FastAPI, SQLAlchemy, Pydantic)
- `backend/requirements.txt` — зависимости Python
- `assets/images/` — изображения для карточек

## Запуск Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
