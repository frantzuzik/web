'use strict';

// ===== Демонстрационные данные =====
const DEFAULT_ITEMS = [
    { id: '1', title: 'Паста карбонара', description: 'Классика итальянской кухни: спагетти, гуанчиале и яичный соус.', time: 25, difficulty: 'Средняя', cuisine: 'Итальянская', image: 'assets/images/carbonara.jpg' },
    { id: '2', title: 'Том Ям', description: 'Острый тайский суп с креветками и кокосовым молоком.', time: 40, difficulty: 'Сложная', cuisine: 'Тайская', image: 'assets/images/tom-yam.jpg' },
    { id: '3', title: 'Шакшука', description: 'Яйца, запечённые в пряном томатном соусе с болгарским перцем.', time: 20, difficulty: 'Лёгкая', cuisine: 'Ближневосточная', image: 'assets/images/shakshuka.jpg' },
    { id: '4', title: 'Панкейки', description: 'Пышные оладьи на кефире — идеальный завтрак выходного дня.', time: 15, difficulty: 'Лёгкая', cuisine: 'Американская', image: 'assets/images/pancakes.jpg' },
    { id: '5', title: 'Борщ', description: 'Наваристый суп со свёклой, капустой и говядиной на кости.', time: 90, difficulty: 'Средняя', cuisine: 'Восточноевропейская', image: 'assets/images/borscht.jpg' },
    { id: '6', title: 'Тирамису', description: 'Десерт без выпечки: маскарпоне, савоярди и крепкий кофе.', time: 30, difficulty: 'Средняя', cuisine: 'Итальянская', image: 'assets/images/tiramisu.jpg' }
];

const STORAGE_KEY = 'cookbook.items.v1';

// ===== Состояние =====
const state = {
    items: [],
    searchQuery: '',
    selectedCategory: 'all',
    sortBy: 'name-asc'
};

// ===== DOM =====
const cardsEl = document.getElementById('cards');
const searchInput = document.getElementById('query');
const categorySelect = document.getElementById('category');
const sortSelect = document.getElementById('sort');
const addBtn = document.getElementById('add-btn');
const modal = document.getElementById('modal');
const form = document.getElementById('add-form');
const cuisinesList = document.getElementById('cuisines-list');

// ===== Инициализация =====
function init() {
    const saved = loadFromStorage();
    state.items = saved ?? DEFAULT_ITEMS.slice();
    render();
    bindEvents();
}

// ===== localStorage =====
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
    } catch {
        // приватный режим или переполнение — молча игнорируем
    }
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.items) ? parsed.items : null;
    } catch {
        return null;
    }
}

// ===== Фильтрация и сортировка =====
function getVisibleItems() {
    const query = state.searchQuery.trim().toLowerCase();

    const filtered = state.items.filter(item => {
        const matchesQuery = !query
            || item.title.toLowerCase().includes(query)
            || item.description.toLowerCase().includes(query);
        const matchesCategory = state.selectedCategory === 'all'
            || item.cuisine === state.selectedCategory;
        return matchesQuery && matchesCategory;
    });

    // Иммутабельная сортировка: копируем, оригинал не трогаем
    const sorted = [...filtered];

    switch (state.sortBy) {
        case 'name-asc':
            sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
            break;
        case 'name-desc':
            sorted.sort((a, b) => b.title.localeCompare(a.title, 'ru'));
            break;
        case 'time-asc':
            sorted.sort((a, b) => a.time - b.time);
            break;
        case 'time-desc':
            sorted.sort((a, b) => b.time - a.time);
            break;
    }

    return sorted;
}

// ===== Рендер =====
function render() {
    renderCategoryOptions();
    renderCuisinesDatalist();
    renderCards();
}

function renderCategoryOptions() {
    const cuisines = [...new Set(state.items.map(item => item.cuisine))]
        .sort((a, b) => a.localeCompare(b, 'ru'));

    const current = state.selectedCategory;

    categorySelect.textContent = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'Все кухни';
    categorySelect.appendChild(allOpt);

    cuisines.forEach(cuisine => {
        const opt = document.createElement('option');
        opt.value = cuisine;
        opt.textContent = cuisine;
        categorySelect.appendChild(opt);
    });

    if (current === 'all' || cuisines.includes(current)) {
        categorySelect.value = current;
    } else {
        state.selectedCategory = 'all';
        categorySelect.value = 'all';
    }
}

function renderCuisinesDatalist() {
    const cuisines = [...new Set(state.items.map(item => item.cuisine))];
    cuisinesList.textContent = '';
    cuisines.forEach(cuisine => {
        const opt = document.createElement('option');
        opt.value = cuisine;
        cuisinesList.appendChild(opt);
    });
}

function renderCards() {
    const items = getVisibleItems();
    cardsEl.textContent = '';

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = state.items.length === 0
            ? 'Пока нет рецептов. Нажмите «Добавить рецепт», чтобы создать первый.'
            : 'Ничего не найдено. Попробуйте изменить фильтры.';
        cardsEl.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(createCard(item)));
    cardsEl.appendChild(fragment);
}

function createCard(item) {
    const article = document.createElement('article');
    article.className = 'card';
    article.dataset.id = item.id;

    // Медиа
    const media = document.createElement('div');
    media.className = 'card__media';

    if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.title;
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            media.textContent = '';
            media.classList.add('card__media--placeholder');
            media.textContent = item.title.charAt(0).toUpperCase();
        });
        media.appendChild(img);
    } else {
        media.classList.add('card__media--placeholder');
        media.textContent = item.title.charAt(0).toUpperCase();
    }

    // Тело
    const body = document.createElement('div');
    body.className = 'card__body';

    const cuisine = document.createElement('p');
    cuisine.className = 'card__cuisine';
    cuisine.textContent = item.cuisine;

    const title = document.createElement('h3');
    title.textContent = item.title;

    const description = document.createElement('p');
    description.textContent = item.description;

    const props = document.createElement('ul');
    props.className = 'card-props';

    const timeLi = document.createElement('li');
    timeLi.textContent = `${item.time} мин`;
    const diffLi = document.createElement('li');
    diffLi.textContent = item.difficulty;
    props.append(timeLi, diffLi);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'card__delete';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.setAttribute('aria-label', `Удалить рецепт «${item.title}»`);

    body.append(cuisine, title, description, props, deleteBtn);
    article.append(media, body);

    return article;
}

// ===== События =====
function bindEvents() {
    // Поиск в реальном времени
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderCards();
    });

    // Фильтр по кухне
    categorySelect.addEventListener('change', (e) => {
        state.selectedCategory = e.target.value;
        renderCards();
    });

    // Сортировка
    sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderCards();
    });

    // Открытие модального окна
    addBtn.addEventListener('click', openModal);

    // Закрытие: крестик, Отмена, клик по подложке
    modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) {
            closeModal();
        }
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) {
            closeModal();
        }
    });

    // Отправка формы
    form.addEventListener('submit', handleSubmit);

    // При вводе — сбрасываем сообщение об ошибке поля
    form.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('input', () => clearError(field));
    });

    // Удаление карточки — делегирование событий
    cardsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="delete"]');
        if (!btn) return;

        const card = btn.closest('.card');
        const id = card.dataset.id;

        state.items = state.items.filter(item => item.id !== id);
        saveToStorage();
        render();
    });
}

// ===== Модальное окно =====
function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    form.reset();
    clearAllErrors();

    const firstField = form.querySelector('input, select, textarea');
    if (firstField) {
        setTimeout(() => firstField.focus(), 50);
    }
}

function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// ===== Форма =====
function handleSubmit(e) {
    e.preventDefault();

    const fields = [
        document.getElementById('new-title'),
        document.getElementById('new-description'),
        document.getElementById('new-time'),
        document.getElementById('new-difficulty'),
        document.getElementById('new-cuisine'),
        document.getElementById('new-image')
    ];

    let isValid = true;
    fields.forEach(field => {
        if (!validateField(field)) isValid = false;
    });

    if (!isValid) {
        const firstInvalid = fields.find(f => !f.validity.valid);
        if (firstInvalid) firstInvalid.focus();
        return;
    }

    const newItem = {
        id: String(Date.now()),
        title: document.getElementById('new-title').value.trim(),
        description: document.getElementById('new-description').value.trim(),
        time: Number(document.getElementById('new-time').value),
        difficulty: document.getElementById('new-difficulty').value,
        cuisine: document.getElementById('new-cuisine').value.trim(),
        image: document.getElementById('new-image').value.trim()
    };

    state.items.push(newItem);
    saveToStorage();
    render();
    closeModal();
}

function validateField(field) {
    const errorEl = document.getElementById(`${field.id}-error`);
    if (!errorEl) return true;

    if (field.validity.valid) {
        errorEl.textContent = '';
        return true;
    }

    let message;
    if (field.validity.valueMissing) {
        message = 'Это поле обязательно.';
    } else if (field.validity.tooShort) {
        message = `Минимум ${field.minLength} символов.`;
    } else if (field.validity.tooLong) {
        message = `Максимум ${field.maxLength} символов.`;
    } else if (field.validity.rangeUnderflow) {
        message = `Минимум ${field.min}.`;
    } else if (field.validity.rangeOverflow) {
        message = `Максимум ${field.max}.`;
    } else if (field.validity.typeMismatch) {
        message = 'Проверьте формат: должна быть ссылка вида https://...';
    } else {
        message = field.validationMessage || 'Некорректное значение.';
    }

    errorEl.textContent = message;
    return false;
}

function clearError(field) {
    const errorEl = document.getElementById(`${field.id}-error`);
    if (errorEl) errorEl.textContent = '';
}

function clearAllErrors() {
    form.querySelectorAll('.error').forEach(el => {
        el.textContent = '';
    });
}

// ===== Запуск =====
init();
