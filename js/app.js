'use strict';

const API_BASE = '/api';

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
let lastFocused = null;
let formSubmitted = false;

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

async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (e) {
        throw new Error('Сервер недоступен. Запущен ли backend?');
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        let msg = data.detail;
        if (Array.isArray(msg)) msg = msg.map(d => `${d.loc.join('.')}: ${d.msg}`).join('; ');
        throw new Error(msg || `HTTP ${response.status}`);
    }
    return data;
}

const api = {
    listRecipes: () => apiFetch('/recipes'),
    createRecipe: (payload) => apiFetch('/recipes', { method: 'POST', body: JSON.stringify(payload) }),
    updateRecipe: (id, payload) => apiFetch(`/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteRecipe: (id) => apiFetch(`/recipes/${id}`, { method: 'DELETE' }),
    listCuisines: () => apiFetch('/cuisines'),
};

async function loadData() {
    state.loading = true; state.error = ''; render();
    try {
        const [recipes, cuisines] = await Promise.all([api.listRecipes(), api.listCuisines()]);
        state.items = recipes; state.cuisines = cuisines;
    } catch (err) {
        state.error = err.message;
    } finally {
        state.loading = false; renderCuisineOptions(); render();
    }
}

function getVisibleItems() {
    const q = state.searchQuery.toLowerCase().trim();
    const filtered = state.items.filter(item => {
        const matchQ = q === '' || item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
        const matchC = state.selectedCuisine === 'all' || String(item.cuisine.id) === state.selectedCuisine;
        return matchQ && matchC;
    });
    const [key, dir] = state.sortBy.split('-');
    return [...filtered].sort((a, b) => {
        if (key === 'time') return dir === 'asc' ? a.time_minutes - b.time_minutes : b.time_minutes - a.time_minutes;
        const cmp = a.name.localeCompare(b.name, 'ru');
        return dir === 'asc' ? cmp : -cmp;
    });
}

function createCard(item) {
    const card = document.createElement('article');
    card.className = 'card';
    const media = document.createElement('div');
    media.className = 'card__media';
    if (item.image_url) {
        const img = document.createElement('img');
        img.src = item.image_url; img.alt = item.name;
        img.onerror = () => { img.remove(); media.classList.add('card__media--empty'); media.textContent = '🍽'; };
        media.append(img);
    } else {
        media.classList.add('card__media--empty'); media.textContent = '🍽';
    }
    const body = document.createElement('div'); body.className = 'card__body';
    const head = document.createElement('div'); head.className = 'card__head';
    const title = document.createElement('h3'); title.textContent = item.name;
    const actions = document.createElement('div'); actions.className = 'card__actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'card__edit'; editBtn.textContent = '✎'; editBtn.dataset.action = 'edit'; editBtn.dataset.id = item.id;
    const delBtn = document.createElement('button');
    delBtn.className = 'card__delete'; delBtn.textContent = '✕'; delBtn.dataset.action = 'delete'; delBtn.dataset.id = item.id;
    
    actions.append(editBtn, delBtn); head.append(title, actions);
    const desc = document.createElement('p'); desc.textContent = item.description || '';
    const props = document.createElement('ul'); props.className = 'card-props';
    [`${item.time_minutes} мин`, item.difficulty, item.cuisine.name].forEach(v => {
        const li = document.createElement('li'); li.textContent = v; props.append(li);
    });
    
    body.append(head, desc, props); card.append(media, body);
    return card;
}

function render() {
    els.cards.replaceChildren();
    if (state.loading) {
        els.cards.innerHTML = '<p class="loading">Загрузка...</p>'; els.results.textContent = ''; return;
    }
    if (state.error) {
        const b = document.createElement('div'); b.className = 'error-banner';
        b.textContent = state.error;
        els.cards.append(b); els.results.textContent = ''; return;
    }
    const items = getVisibleItems();
    if (items.length === 0) {
        els.cards.innerHTML = '<p class="empty">Ничего не найдено</p>';
    } else {
        items.forEach(i => els.cards.append(createCard(i)));
    }
    els.results.textContent = `Показано ${items.length} из ${state.items.length}`;
}

function renderCuisineOptions() {
    const sorted = [...state.cuisines].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    els.filterCuisine.innerHTML = '<option value="all">Все кухни</option>';
    sorted.forEach(c => els.filterCuisine.append(new Option(c.name, c.id)));
    els.cuisineOptions.innerHTML = '';
    sorted.forEach(c => els.cuisineOptions.append(new Option(c.name, c.name)));
}

function getFieldError(field) {
    if (field.validity.valid) return '';
    if (field.validity.valueMissing) return 'Заполните поле';
    if (field.validity.tooShort) return `Минимум ${field.minLength} символов`;
    return 'Некорректное значение';
}

function validateForm() {
    let firstInvalid = null;
    els.form.querySelectorAll('input, select').forEach(field => {
        const msg = getFieldError(field);
        const wrapper = field.closest('.field');
        const errEl = wrapper.querySelector('.error');
        if (msg) {
            wrapper.classList.add('is-invalid');
            errEl.textContent = msg;
            if (!firstInvalid) firstInvalid = field;
        } else {
            wrapper.classList.remove('is-invalid');
            errEl.textContent = '';
        }
    });
    if (firstInvalid) { firstInvalid.focus(); return false; }
    return true;
}

function openModal(recipe = null) {
    lastFocused = document.activeElement; editingId = recipe ? recipe.id : null;
    els.form.reset(); formSubmitted = false; els.formError.textContent = '';
    els.form.querySelectorAll('.field').forEach(f => f.classList.remove('is-invalid'));
    els.modalTitle.textContent = recipe ? 'Редактировать' : 'Новый рецепт';
    
    if (recipe) {
        els.form.elements.name.value = recipe.name;
        els.form.elements.description.value = recipe.description || '';
        els.form.elements.time_minutes.value = recipe.time_minutes;
        els.form.elements.difficulty.value = recipe.difficulty;
        els.form.elements.cuisine.value = recipe.cuisine.name;
        els.form.elements.image_url.value = recipe.image_url || '';
    }
    els.modal.hidden = false; document.body.classList.add('no-scroll');
    els.form.elements.name.focus();
}

function closeModal() {
    els.modal.hidden = true; document.body.classList.remove('no-scroll'); editingId = null;
    if (lastFocused) lastFocused.focus();
}

async function handleCardsClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'delete') {
        if (!confirm('Удалить?')) return;
        try { await api.deleteRecipe(id); loadData(); } catch (err) { alert(err.message); }
    } else if (btn.dataset.action === 'edit') {
        const recipe = state.items.find(i => i.id === id);
        if (recipe) openModal(recipe);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault(); formSubmitted = true; els.formError.textContent = '';
    if (!validateForm()) return;
    const fd = new FormData(els.form);
    const payload = {
        name: fd.get('name'), description: fd.get('description') || null,
        time_minutes: Number(fd.get('time_minutes')), difficulty: fd.get('difficulty'),
        cuisine: fd.get('cuisine'), image_url: fd.get('image_url') || null
    };
    els.submitBtn.disabled = true;
    try {
        if (editingId) await api.updateRecipe(editingId, payload);
        else await api.createRecipe(payload);
        closeModal(); loadData();
    } catch (err) {
        els.formError.textContent = err.message;
    } finally {
        els.submitBtn.disabled = false;
    }
}

document.getElementById('query').addEventListener('input', e => { state.searchQuery = e.target.value; render(); });
els.filterCuisine.addEventListener('change', e => { state.selectedCuisine = e.target.value; render(); });
els.sort.addEventListener('change', e => { state.sortBy = e.target.value; render(); });
els.cards.addEventListener('click', handleCardsClick);
els.openModalBtn.addEventListener('click', () => openModal());
els.modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !els.modal.hidden) closeModal(); });
els.form.addEventListener('submit', handleFormSubmit);
loadData();
