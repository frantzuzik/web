'use strict';

const API_BASE = 'http://127.0.0.1:8000/api';

/* ===== 1. Состояние ===== */
const state = {
    items: [],
    cuisines: [],
    searchQuery: '',
    selectedCuisine: 'all',
    sortBy: 'name-asc',
    loading: false,
    error: '',
};

let editingId = null;
let formSubmitted = false;

/* ===== 2. DOM ===== */
const els = {
    cards: document.getElementById('cards'),
    results: document.getElementById('results'),
    query: document.getElementById('query'),
    filterCuisine: document.getElementById('filter-cuisine'),
    sort: document.getElementById('sort'),
    openModalBtn: document.getElementById('open-modal'),
    modal: document.getElementById('modal'),
    form: document.getElementById('recipe-form'),
    cuisineOptions: document.getElementById('cuisine-options'),
    modalTitle: document.getElementById('modal-title'),
    submitBtn: document.getElementById('form-submit'),
    formError: document.getElementById('form-error'),
};

/* ===== 3. API ===== */
async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
        throw new Error('Сервер недоступен. Запущен ли backend?');
    }

    if (res.status === 204) return null;

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
        const detail = data && data.detail;
        let msg;
        if (Array.isArray(detail)) {
            msg = detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
        } else if (typeof detail === 'string') {
            msg = detail;
        } else {
            msg = `HTTP ${res.status}`;
        }
        throw new Error(msg);
    }
    return data;
}

const api = {
    listRecipes: () => apiFetch('/recipes'),
    createRecipe: (d) => apiFetch('/recipes', { method: 'POST', body: JSON.stringify(d) }),
    updateRecipe: (id, d) => apiFetch(`/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    deleteRecipe: (id) => apiFetch(`/recipes/${id}`, { method: 'DELETE' }),
    listCuisines: () => apiFetch('/cuisines'),
};

/* ===== 4. Загрузка ===== */
async function loadData() {
    state.loading = true;
    state.error = '';
    render();

    try {
        const [recipes, cuisines] = await Promise.all([api.listRecipes(), api.listCuisines()]);
        state.items = recipes;
        state.cuisines = cuisines;
    } catch (e) {
        state.error = e.message;
    } finally {
        state.loading = false;
        renderCuisineOptions();
        render();
    }
}

/* ===== 5. Поиск + фильтр + сортировка ===== */
function getVisibleItems() {
    const q = state.searchQuery.trim().toLowerCase();

    const filtered = state.items.filter((it) => {
        const okQ = !q || it.name.toLowerCase().includes(q) || (it.description ?? '').toLowerCase().includes(q);
        const okC = state.selectedCuisine === 'all' || String(it.cuisine.id) === state.selectedCuisine;
        return okQ && okC;
    });

    const [key, dir] = state.sortBy.split('-');
    const sorted = [...filtered];

    sorted.sort((a, b) => {
        if (key === 'time') return dir === 'asc' ? a.time_minutes - b.time_minutes : b.time_minutes - a.time_minutes;
        const cmp = a.name.localeCompare(b.name, 'ru');
        return dir === 'asc' ? cmp : -cmp;
    });

    return sorted;
}

/* ===== 6. Render ===== */
function createCard(item) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = item.id;

    const media = document.createElement('div');
    media.className = 'card__media';
    if (item.image_url) {
        const img = document.createElement('img');
        img.src = item.image_url;
        img.alt = item.name;
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            img.remove();
            media.classList.add('card__media--empty');
            media.textContent = '🍽';
        });
        media.append(img);
    } else {
        media.classList.add('card__media--empty');
        media.textContent = '🍽';
    }

    const body = document.createElement('div');
    body.className = 'card__body';

    const head = document.createElement('div');
    head.className = 'card__head';

    const title = document.createElement('h3');
    title.textContent = item.name;

    const actions = document.createElement('div');
    actions.className = 'card__actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'card__edit';
    editBtn.dataset.action = 'edit';
    editBtn.dataset.id = item.id;
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', `Редактировать «${item.name}»`);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'card__delete';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.id = item.id;
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', `Удалить «${item.name}»`);

    actions.append(editBtn, delBtn);
    head.append(title, actions);

    const desc = document.createElement('p');
    desc.textContent = item.description ?? '';

    const props = document.createElement('ul');
    props.className = 'card-props';
    [`${item.time_minutes} мин`, item.difficulty, item.cuisine.name].forEach((v) => {
        const li = document.createElement('li');
        li.textContent = v;
        props.append(li);
    });

    body.append(head, desc, props);
    card.append(media, body);
    return card;
}

function render() {
    els.cards.replaceChildren();

    if (state.loading) {
        const p = document.createElement('p');
        p.className = 'loading';
        p.textContent = 'Загрузка…';
        els.cards.append(p);
        els.results.textContent = '';
        return;
    }

    if (state.error) {
        const box = document.createElement('div');
        box.className = 'error-banner';

        const p = document.createElement('p');
        p.textContent = state.error;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.textContent = 'Повторить';
        btn.addEventListener('click', loadData);

        box.append(p, btn);
        els.cards.append(box);
        els.results.textContent = '';
        return;
    }

    const items = getVisibleItems();

    if (items.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = state.items.length === 0
            ? 'Пока нет рецептов. Нажмите «Добавить рецепт».'
            : 'Ничего не найдено. Измените запрос или фильтр.';
        els.cards.append(p);
    } else {
        const frag = document.createDocumentFragment();
        items.forEach((it) => frag.append(createCard(it)));
        els.cards.append(frag);
    }

    els.results.textContent = `Показано ${items.length} из ${state.items.length}`;
}

function renderCuisineOptions() {
    const cuisines = [...state.cuisines].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    if (state.selectedCuisine !== 'all' && !cuisines.some((c) => String(c.id) === state.selectedCuisine)) {
        state.selectedCuisine = 'all';
    }

    els.filterCuisine.replaceChildren();
    els.filterCuisine.append(new Option('Все кухни', 'all'));
    cuisines.forEach((c) => els.filterCuisine.append(new Option(c.name, String(c.id))));
    els.filterCuisine.value = state.selectedCuisine;

    els.cuisineOptions.replaceChildren();
    cuisines.forEach((c) => els.cuisineOptions.append(new Option(c.name, c.name)));
}

/* ===== 7. Валидация ===== */
function getFieldError(field) {
    const v = field.validity;
    if (v.valid) return '';
    if (v.valueMissing) return 'Заполните поле';
    if (v.tooShort) return `Минимум ${field.minLength} символов`;
    if (v.tooLong) return `Не больше ${field.maxLength} символов`;
    if (v.rangeUnderflow) return `Не меньше ${field.min}`;
    if (v.rangeOverflow) return `Не больше ${field.max}`;
    if (v.badInput) return 'Введите число';
    return 'Некорректное значение';
}

function setFieldError(field, message) {
    const wrap = field.closest('.field');
    if (!wrap) return;
    wrap.classList.toggle('is-invalid', Boolean(message));
    const err = wrap.querySelector('.error');
    if (err) err.textContent = message;
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearFormErrors() {
    els.form.querySelectorAll('.field.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
    els.form.querySelectorAll('.error').forEach((el) => { el.textContent = ''; });
    els.formError.textContent = '';
}

function validateForm() {
    let firstInvalid = null;
    els.form.querySelectorAll('input, select, textarea').forEach((field) => {
        const msg = getFieldError(field);
        setFieldError(field, msg);
        if (msg && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
}

/* ===== 8. Модальное окно ===== */
function openModal(recipe = null) {
    editingId = recipe ? recipe.id : null;
    els.form.reset();
    formSubmitted = false;
    clearFormErrors();

    els.modalTitle.textContent = recipe ? 'Редактировать рецепт' : 'Новый рецепт';
    els.submitBtn.textContent = recipe ? 'Сохранить' : 'Добавить';

    if (recipe) {
        els.form.elements.name.value = recipe.name;
        els.form.elements.description.value = recipe.description ?? '';
        els.form.elements.time_minutes.value = recipe.time_minutes;
        els.form.elements.difficulty.value = recipe.difficulty;
        els.form.elements.cuisine.value = recipe.cuisine.name;
        els.form.elements.image_url.value = recipe.image_url ?? '';
    }

    els.modal.hidden = false;
    document.body.classList.add('no-scroll');
    els.form.querySelector('input, select, textarea')?.focus();
}

function closeModal() {
    els.modal.hidden = true;
    document.body.classList.remove('no-scroll');
    editingId = null;
}

/* ===== 9. Обработчики ===== */
function handleCardsClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = Number(btn.dataset.id);

    if (btn.dataset.action === 'delete') {
        if (!confirm('Удалить рецепт?')) return;
        api.deleteRecipe(id).then(loadData).catch((err) => alert(err.message));
    } else if (btn.dataset.action === 'edit') {
        const recipe = state.items.find((it) => it.id === id);
        if (recipe) openModal(recipe);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    formSubmitted = true;
    els.formError.textContent = '';
    if (!validateForm()) return;

    const fd = new FormData(els.form);
    const payload = {
        name: (fd.get('name') ?? '').toString().trim(),
        description: (fd.get('description') ?? '').toString().trim() || null,
        time_minutes: Number(fd.get('time_minutes')),
        difficulty: (fd.get('difficulty') ?? '').toString(),
        cuisine: (fd.get('cuisine') ?? '').toString().trim(),
        image_url: (fd.get('image_url') ?? '').toString().trim() || null,
    };

    els.submitBtn.disabled = true;
    try {
        if (editingId === null) {
            await api.createRecipe(payload);
        } else {
            await api.updateRecipe(editingId, payload);
        }
        closeModal();
        await loadData();
    } catch (err) {
        els.formError.textContent = err.message;
    } finally {
        els.submitBtn.disabled = false;
    }
}

function bindEvents() {
    els.query.addEventListener('input', (e) => { state.searchQuery = e.target.value; render(); });
    els.filterCuisine.addEventListener('change', (e) => { state.selectedCuisine = e.target.value; render(); });
    els.sort.addEventListener('change', (e) => { state.sortBy = e.target.value; render(); });

    els.cards.addEventListener('click', handleCardsClick);
    els.openModalBtn.addEventListener('click', () => openModal());
    els.modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.modal.hidden) closeModal(); });

    els.form.addEventListener('submit', handleFormSubmit);
    els.form.addEventListener('input', (e) => {
        if (formSubmitted && e.target.matches('input, select, textarea')) {
            setFieldError(e.target, getFieldError(e.target));
        }
    });
    els.form.addEventListener('change', (e) => {
        if (formSubmitted && e.target.matches('input, select, textarea')) {
            setFieldError(e.target, getFieldError(e.target));
        }
    });
}

/* ===== 10. Старт ===== */
els.query.value = state.searchQuery;
els.sort.value = state.sortBy;
bindEvents();
loadData();
