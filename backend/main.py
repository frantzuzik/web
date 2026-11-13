import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# ==========================================
# 1. БАЗА ДАННЫХ (SQLite)
# ==========================================
DATABASE_URL = "sqlite+aiosqlite:///./cookbook.db"
engine = create_async_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as session:
        yield session

# ==========================================
# 2. МОДЕЛИ (Таблицы)
# ==========================================
class Cuisine(Base):
    __tablename__ = "cuisines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    recipes: Mapped[list["Recipe"]] = relationship(back_populates="cuisine")

class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (
        CheckConstraint("time_minutes > 0 AND time_minutes <= 600", name="ck_recipes_time"),
        CheckConstraint("difficulty IN ('Лёгкая', 'Средняя', 'Сложная')", name="ck_recipes_difficulty"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cuisine_id: Mapped[int] = mapped_column(ForeignKey("cuisines.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    cuisine: Mapped["Cuisine"] = relationship(back_populates="recipes", lazy="joined")

# ==========================================
# 3. СХЕМЫ ВАЛИДАЦИИ (Pydantic)
# ==========================================
Difficulty = Literal["Лёгкая", "Средняя", "Сложная"]

class CuisineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название кухни")

class CuisineCreate(CuisineBase):
    model_config = ConfigDict(json_schema_extra={"example": {"name": "Итальянская"}})

class CuisineSchema(CuisineBase):
    id: int
    model_config = ConfigDict(from_attributes=True, json_schema_extra={"example": {"id": 1, "name": "Итальянская"}})

class RecipeBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200, description="Название рецепта")
    description: str | None = Field(default=None, max_length=1000)
    time_minutes: int = Field(..., ge=1, le=600, description="Время в минутах")
    difficulty: Difficulty
    cuisine: str = Field(..., min_length=1, max_length=100, description="Название кухни")
    image_url: str | None = Field(default=None, max_length=500)

class RecipeCreate(RecipeBase):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "name": "Паэлья", "description": "Испанский рис", "time_minutes": 45,
            "difficulty": "Средняя", "cuisine": "Испанская", "image_url": "assets/images/paella.jpg"
        }
    })

class RecipeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    time_minutes: int | None = Field(default=None, ge=1, le=600)
    difficulty: Difficulty | None = None
    cuisine: str | None = Field(default=None, min_length=1, max_length=100)
    image_url: str | None = Field(default=None, max_length=500)

class RecipeReplace(RecipeBase):
    pass

class RecipeSchema(BaseModel):
    id: int
    name: str
    description: str | None
    time_minutes: int
    difficulty: Difficulty
    cuisine: CuisineSchema
    image_url: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ErrorResponse(BaseModel):
    detail: str | list

# ==========================================
# 4. CRUD ОПЕРАЦИИ (Логика)
# ==========================================
async def get_or_create_cuisine(db: AsyncSession, name: str) -> Cuisine:
    result = await db.execute(select(Cuisine).where(Cuisine.name == name))
    cuisine = result.scalar_one_or_none()
    if not cuisine:
        cuisine = Cuisine(name=name)
        db.add(cuisine)
        await db.flush()
    return cuisine

async def get_recipe(db: AsyncSession, recipe_id: int):
    return await db.get(Recipe, recipe_id)

# ==========================================
# 5. НАСТРОЙКА И ЗАПУСК ПРИЛОЖЕНИЯ
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаем таблицы при старте
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Автоматическое добавление 6 рецептов, если БД пуста
    async with SessionLocal() as db:
        result = await db.execute(select(Recipe))
        if result.first() is None:
            demo = [
                ("Паста карбонара", "Классика итальянской кухни.", 25, "Средняя", "Итальянская", "assets/images/carbonara.jpg"),
                ("Том Ям", "Острый тайский суп с креветками.", 40, "Сложная", "Тайская", "assets/images/tom-yam.jpg"),
                ("Шакшука", "Яйца в пряном томатном соусе.", 20, "Лёгкая", "Ближневосточная", "assets/images/shakshuka.jpg"),
                ("Панкейки", "Пышные оладьи на завтрак.", 15, "Лёгкая", "Американская", "assets/images/pancakes.jpg"),
                ("Борщ", "Наваристый суп со свёклой.", 90, "Средняя", "Восточноевропейская", "assets/images/borscht.jpg"),
                ("Тирамису", "Десерт без выпечки.", 30, "Средняя", "Итальянская", "assets/images/tiramisu.jpg"),
            ]
            for name, desc, t, diff, cu, img in demo:
                c = await get_or_create_cuisine(db, cu)
                db.add(Recipe(name=name, description=desc, time_minutes=t, difficulty=diff, cuisine_id=c.id, image_url=img))
            await db.commit()
    yield
    await engine.dispose()

app = FastAPI(
    title="Cook Book API",
    version="1.0.0",
    description="REST API для кулинарной книги. Основная сущность: Recipe, связанная: Cuisine.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# Обработчики ошибок
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    for error in exc.errors():
        if error.get("type") in {"json_invalid", "value_error.jsondecode"}:
            return JSONResponse(status_code=400, content={"detail": "Malformed JSON body"})
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

# ==========================================
# 6. РОУТЫ (API)
# ==========================================
NOT_FOUND = {404: {"model": ErrorResponse, "description": "Not found"}}
VALIDATION = {422: {"model": ErrorResponse, "description": "Validation error"}}
CONFLICT = {409: {"model": ErrorResponse, "description": "Conflict"}}
INTERNAL = {500: {"model": ErrorResponse, "description": "Internal Server Error"}}

@app.get("/api/health", tags=["Service"])
async def health():
    return {"status": "ok"}

# --- Recipes ---
@app.get("/api/recipes", response_model=list[RecipeSchema], tags=["Recipes"], responses={**INTERNAL})
async def read_recipes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recipe).order_by(Recipe.id))
    return list(result.unique().scalars().all())

@app.post("/api/recipes", response_model=RecipeSchema, status_code=201, tags=["Recipes"], responses={**VALIDATION, **INTERNAL})
async def create_recipe(data: RecipeCreate, db: AsyncSession = Depends(get_db)):
    cuisine = await get_or_create_cuisine(db, data.cuisine)
    recipe = Recipe(**data.model_dump(exclude={"cuisine"}), cuisine_id=cuisine.id)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    return recipe

@app.get("/api/recipes/{recipe_id}", response_model=RecipeSchema, tags=["Recipes"], responses={**NOT_FOUND, **INTERNAL})
async def read_recipe(recipe_id: int, db: AsyncSession = Depends(get_db)):
    recipe = await get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe

@app.put("/api/recipes/{recipe_id}", response_model=RecipeSchema, tags=["Recipes"], responses={**NOT_FOUND, **VALIDATION, **INTERNAL})
async def replace_recipe(recipe_id: int, data: RecipeReplace, db: AsyncSession = Depends(get_db)):
    recipe = await get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    cuisine = await get_or_create_cuisine(db, data.cuisine)
    recipe.name = data.name
    recipe.description = data.description
    recipe.time_minutes = data.time_minutes
    recipe.difficulty = data.difficulty
    recipe.image_url = data.image_url
    recipe.cuisine_id = cuisine.id
    await db.commit()
    await db.refresh(recipe)
    return recipe

@app.patch("/api/recipes/{recipe_id}", response_model=RecipeSchema, tags=["Recipes"], responses={**NOT_FOUND, **VALIDATION, **INTERNAL})
async def update_recipe(recipe_id: int, data: RecipeUpdate, db: AsyncSession = Depends(get_db)):
    recipe = await get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    payload = data.model_dump(exclude_unset=True)
    if "cuisine" in payload and payload["cuisine"]:
        cuisine = await get_or_create_cuisine(db, payload.pop("cuisine"))
        recipe.cuisine_id = cuisine.id
    for field, value in payload.items():
        setattr(recipe, field, value)
    await db.commit()
    await db.refresh(recipe)
    return recipe

@app.delete("/api/recipes/{recipe_id}", status_code=204, tags=["Recipes"], responses={**NOT_FOUND, **INTERNAL})
async def delete_recipe(recipe_id: int, db: AsyncSession = Depends(get_db)):
    recipe = await get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    await db.delete(recipe)
    await db.commit()

# --- Cuisines ---
@app.get("/api/cuisines", response_model=list[CuisineSchema], tags=["Cuisines"], responses={**INTERNAL})
async def read_cuisines(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cuisine).order_by(Cuisine.name))
    return list(result.scalars().all())

@app.post("/api/cuisines", response_model=CuisineSchema, status_code=201, tags=["Cuisines"], responses={**CONFLICT, **VALIDATION, **INTERNAL})
async def create_cuisine(data: CuisineCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cuisine).where(Cuisine.name == data.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cuisine already exists")
    cuisine = await get_or_create_cuisine(db, data.name)
    await db.commit()
    await db.refresh(cuisine)
    return cuisine

@app.patch("/api/cuisines/{cuisine_id}", response_model=CuisineSchema, tags=["Cuisines"], responses={**NOT_FOUND, **CONFLICT, **VALIDATION, **INTERNAL})
async def update_cuisine(cuisine_id: int, data: CuisineCreate, db: AsyncSession = Depends(get_db)):
    cuisine = await db.get(Cuisine, cuisine_id)
    if not cuisine:
        raise HTTPException(status_code=404, detail="Cuisine not found")
    result = await db.execute(select(Cuisine).where(Cuisine.name == data.name, Cuisine.id != cuisine_id))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cuisine name already exists")
    cuisine.name = data.name
    await db.commit()
    await db.refresh(cuisine)
    return cuisine

@app.delete("/api/cuisines/{cuisine_id}", status_code=204, tags=["Cuisines"], responses={**NOT_FOUND, **CONFLICT, **INTERNAL})
async def delete_cuisine(cuisine_id: int, db: AsyncSession = Depends(get_db)):
    cuisine = await db.get(Cuisine, cuisine_id)
    if not cuisine:
        raise HTTPException(status_code=404, detail="Cuisine not found")
    try:
        await db.delete(cuisine)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete cuisine: used by recipes")
