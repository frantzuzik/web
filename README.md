# Лабораторная работа № 4
## Мониторинг Docker-контейнеров с помощью Grafana и Prometheus

**Выполнил:** Киреев Ильназ Ильгамович  
**Группа:** ИВТ-ИСУ-302Б  

## Цель работы
Развернуть полноценный стек мониторинга Docker-контейнеров, включающий тестовое приложение (Cook Book), систему сбора метрик (cAdvisor), базу данных временных рядов (Prometheus) и визуализацию нагрузки в реальном времени (Grafana).

## Архитектура мониторинга
Мониторинг реализован по следующей схеме:
1. **webapp (Cook Book)** — тестовое веб-приложение, упакованное в Docker-контейнер.
2. **cAdvisor** — собирает низкоуровневые метрики (CPU, память, сеть) из cgroups всех запущенных контейнеров и экспортирует их через HTTP endpoint.
3. **Prometheus** — периодически опрашивает (scrape) cAdvisor, сохраняет метрики в виде временных рядов и предоставляет язык запросов PromQL.
4. **Grafana** — подключается к Prometheus как к источнику данных (Data Source) и визуализирует метрики на интерактивных дашбордах.

## Файлы конфигурации

### `Dockerfile` (Сборка приложения)
Описание сборки нашего Fullstack-приложения (FastAPI + статика).

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY index.html .
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `prometheus.yml` (Конфигурация сбора метрик)

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
```

### `docker-compose.yml` (Оркестрация)

```yaml
version: '3.8'

services:
  webapp:
    build: .
    container_name: cookbook-app
    ports:
      - "8000:8000"
    volumes:
      - ./backend/cookbook.db:/app/backend/cookbook.db
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    privileged: true
    devices:
      - /dev/kmsg
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    restart: unless-stopped
```

## Ход выполнения работы

### 1. Запуск стека мониторинга
Все контейнеры были запущены одной командой из корневой директории проекта:

```bash
docker compose up -d --build
```

С помощью команды `docker ps` была проверена работа 4 контейнеров: `cookbook-app`, `cadvisor`, `prometheus` и `grafana`.

### 2. Проверка cAdvisor
Открыт веб-интерфейс cAdvisor по адресу `http://localhost:8080`. В разделе `Docker Containers` cAdvisor успешно обнаружил все запущенные контейнеры, включая `cookbook-app`.

### 3. Проверка Prometheus
Открыт интерфейс Prometheus по адресу `http://localhost:9090`.
- В разделе **Status → Targets** проверен target `cadvisor`. Статус: **UP** (зеленый).
- На главной странице в поле запроса введена метрика `container_cpu_usage_seconds_total`. Prometheus успешно выводит данные о потреблении CPU.




### 4. Подключение Grafana к Prometheus
Открыт веб-интерфейс Grafana (`http://localhost:3000`, логин/пароль: `admin`).
В разделе **Connections → Data Sources** был добавлен новый источник данных Prometheus.
В качестве URL указано имя контейнера в Docker-сети: `http://prometheus:9090`. Проверка **Save & Test** прошла успешно.

### 5. Создание дашборда
Для визуализации был импортирован стандартный дашборд сообщества (ID: `193`) для cAdvisor. 
Также была создана кастомная панель (Panel) с использованием PromQL для отслеживания нагрузки на наш контейнер `cookbook-app`:

```promql
sum(rate(container_cpu_usage_seconds_total{name="cookbook-app"}[5m])) * 100
```

### 6. Генерация нагрузки и анализ
Для проверки работоспособности мониторинга была сгенерирована искусственная нагрузка на API приложения Cook Book (множественные запросы к эндпоинту `/api/recipes`).

В результате на дашборде Grafana в реальном времени наблюдался резкий всплеск (spike) на графиках **CPU Usage** и **Memory Usage** для контейнера `cookbook-app`. После прекращения нагрузки метрики вернулись к исходным значениям.
### 7. Скриншоты
![[folder/1.png]]

![[folder/2.png]]

![[folder/3.png]]

![[folder/4.png]]

![[folder/5.png]]

## Вывод
В ходе лабораторной работы был успешно развернут стек мониторинга Docker-контейнеров. Приложение Cook Book было контейнеризировано. Связка cAdvisor + Prometheus + Grafana позволяет в реальном времени отслеживать потребление ресурсов (CPU, RAM, сеть) каждым отдельным контейнером, что критически важно для поддержания стабильности и оптимизации ресурсов в production-среде.
