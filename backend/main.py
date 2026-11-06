import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import (CheckConstraint, Column, DateTime, ForeignKey,
                        Integer, String, Text, create_engine, func, select)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

# ============================================================
# 1. Подключение к БД
# ============================================================

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cookbook.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================================
# 2. Модели (таблицы)
# ============================================================

class Cuisine(Base):
    __tablename__ = "cuisines"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)

    recipes = relationship("Recipe", back_populates="cuisine")

class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (
        CheckConstraint("time_minutes BETWEEN 1 AND 600", name="ck_time"),
        CheckConstraint(
            "difficulty IN ('Лёгкая', 'Средняя', 'Сложная')",
            name="ck_difficulty",
        ),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    time_minutes = Column(Integer, nullable=False)
    difficulty = Column(String(20), nullable=False)
    image_url = Column(String(500), nullable=True)
    cuisine_id = Column(Integer, ForeignKey("cuisines.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    cuisine = relationship("Cuisine", back_populates="recipes", lazy="joined")

# ============================================================
# 3. Pydantic-схемы
# ============================================================

class CuisineOut(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class RecipeIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    time_minutes: int = Field(ge=1, le=600)
    difficulty: str = Field(pattern="^(Лёгкая|Средняя|Сложная)$")
    cuisine: str = Field(min_length=1, max_length=100)
    image_url: str | None = Field(default=None, max_length=500)

class RecipePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    time_minutes: int | None = Field(default=None, ge=1, le=600)
    difficulty: str | None = Field(default=None, pattern="^(Лёгкая|Средняя|Сложная)$")
    cuisine: str | None = Field(default=None, min_length=1, max_length=100)
    image_url: str | None = Field(default=None, max_length=500)

class RecipeOut(BaseModel):
    id: int
    name: str
    description: str | None
    time_minutes: int
    difficulty: str
    cuisine: CuisineOut
    image_url: str | None
    created_at: str

    model_config = ConfigDict(from_attributes=True)

# ============================================================
# 4. Вспомогательная функция
# ============================================================

def get_or_create_cuisine(db: Session, name: str) -> Cuisine:
    name = name.strip()
    cuisine = db.scalar(select(Cuisine).where(Cuisine.name == name))
    if cuisine is None:
        cuisine = Cuisine(name=name)
        db.add(cuisine)
        db.flush()
    return cuisine

# ============================================================
# 5. Приложение
# ============================================================

app = FastAPI(
    title="Cook Book API",
    version="1.0.0",
    description="REST API для кулинарной книги: рецепты и кухни.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup() -> None:
    """Создаёт таблицы и наполняет демо-данными, если БД пустая."""
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        if db.scalar(select(Recipe)) is not None:
            return

        seed = [
            ("Паста карбонара", "Классика итальянской кухни.", 25, "Средняя", "Итальянская", "assets/images/carbonara.jpg"),
            ("Том Ям", "Острый тайский суп с креветками.", 40, "Сложная", "Тайская", "assets/images/tom-yam.jpg"),
            ("Шакшука", "Яйца в пряном томатном соусе.", 20, "Лёгкая", "Ближневосточная", "assets/images/shakshuka.jpg"),
            ("Панкейки", "Пышные оладьи на завтрак.", 15, "Лёгкая", "Американская", "assets/images/pancakes.jpg"),
            ("Борщ", "Наваристый суп со свёклой.", 90, "Средняя", "Восточноевропейская", "assets/images/borscht.jpg"),
            ("Тирамису", "Десерт без выпечки.", 30, "Средняя", "Итальянская", "assets/images/tiramisu.jpg"),
        ]

        for name, desc, t, d, c, img in seed:
            cuisine = get_or_create_cuisine(db, c)
            db.add(Recipe(name=name, description=desc, time_minutes=t,
                          difficulty=d, cuisine_id=cuisine.id, image_url=img))
        db.commit()

# ============================================================
# 6. Роуты
# ============================================================

@app.get("/api/health", tags=["Service"], summary="Проверка состояния")
def health():
    return {"status": "ok"}

@app.get("/api/recipes", response_model=list[RecipeOut],
         tags=["Recipes"], summary="Список рецептов")
def list_recipes(db: Session = Depends(get_db)):
    return db.scalars(select(Recipe).order_by(Recipe.id)).unique().all()

@app.post("/api/recipes", response_model=RecipeOut, status_code=201,
          tags=["Recipes"], summary="Создать рецепт")
def create_recipe(data: RecipeIn, db: Session = Depends(get_db)):
    cuisine = get_or_create_cuisine(db, data.cuisine)
    recipe = Recipe(
        name=data.name,
        description=data.description,
        time_minutes=data.time_minutes,
        difficulty=data.difficulty,
        cuisine_id=cuisine.id,
        image_url=data.image_url,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe

@app.get("/api/recipes/{recipe_id}", response_model=RecipeOut,
         tags=["Recipes"], summary="Рецепт по id")
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(404, "Recipe not found")
    return recipe

@app.patch("/api/recipes/{recipe_id}", response_model=RecipeOut,
           tags=["Recipes"], summary="Обновить рецепт")
def update_recipe(recipe_id: int, data: RecipePatch, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(404, "Recipe not found")

    payload = data.model_dump(exclude_unset=True)

    if payload.get("cuisine"):
        cuisine = get_or_create_cuisine(db, payload.pop("cuisine"))
        recipe.cuisine_id = cuisine.id
    else:
        payload.pop("cuisine", None)

    for field, value in payload.items():
        setattr(recipe, field, value)

    db.commit()
    db.refresh(recipe)
    return recipe

@app.delete("/api/recipes/{recipe_id}", status_code=204,
            tags=["Recipes"], summary="Удалить рецепт")
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(404, "Recipe not found")
    db.delete(recipe)
    db.commit()

@app.get("/api/cuisines", response_model=list[CuisineOut],
         tags=["Cuisines"], summary="Список кухонь")
def list_cuisines(db: Session = Depends(get_db)):
    return db.scalars(select(Cuisine).order_by(Cuisine.name)).all()
