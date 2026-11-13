
# Берем официальный образ Python
FROM python:3.11-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Сначала копируем только зависимости и ставим их (для кэширования)
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Копируем всё остальное (бэкенд, фронтенд, картинки)
COPY backend/ ./backend/
COPY index.html .
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/

# Переходим в папку бэкенда и запускаем сервер
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
