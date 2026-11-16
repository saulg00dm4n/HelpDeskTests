'use strict';

const form = document.querySelector('#ticket-form');
const formMessage = document.querySelector('#form-message');
const list = document.querySelector('#ticket-list');
const count = document.querySelector('#count');
const listMessage = document.querySelector('#list-message');
const search = document.querySelector('#search');
const statusFilter = document.querySelector('#filter-status');
const categoryFilter = document.querySelector('#filter-category');
const priorityFilter = document.querySelector('#filter-priority');

const statusLabels = { new: 'Новая', in_progress: 'В работе', resolved: 'Завершена' };
const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const categoryLabels = { hardware: 'Оборудование', software: 'ПО', network: 'Сеть' };
let lastRequest = 0;

function renderTicketItem(ticket) {
  const li = document.createElement('li');
  li.className = 'ticket';
  li.dataset.testid = 'ticket-item';
  li.dataset.id = String(ticket.id);

  const titleEl = document.createElement('h3');
  titleEl.className = 'ticket-title';
  titleEl.textContent = ticket.title;

  const descEl = document.createElement('p');
  descEl.className = 'ticket-description';
  descEl.textContent = ticket.description;

  const metaEl = document.createElement('div');
  metaEl.className = 'ticket-meta';

  [
    categoryLabels[ticket.category],
    priorityLabels[ticket.priority],
    statusLabels[ticket.status]
  ].forEach((label) => {
    const span = document.createElement('span');
    span.textContent = label;
    metaEl.appendChild(span);
  });

  li.append(titleEl, descEl, metaEl);

  if (ticket.status !== 'resolved') {
    const nextStatus = ticket.status === 'new' ? 'in_progress' : 'resolved';
    const button = document.createElement('button');
    button.dataset.id = String(ticket.id);
    button.dataset.next = nextStatus;
    button.textContent = ticket.status === 'new' ? 'В работу' : 'Завершить';
    li.appendChild(button);
  }

  return li;
}

async function loadTickets() {
  const requestId = ++lastRequest;
  try {
    const query = new URLSearchParams({
      search: search.value,
      status: statusFilter.value,
      category: categoryFilter.value,
      priority: priorityFilter.value
    });
    const response = await fetch(`/api/tickets?${query.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== lastRequest) return; // Не отображать устаревший ответ фильтрации.
    listMessage.textContent = '';
    count.textContent = String(data.total);

    list.replaceChildren();
    if (data.total === 0) {
      list.textContent = 'Заявок по заданным условиям нет.';
      return;
    }

    data.items.forEach((ticket) => {
      list.appendChild(renderTicketItem(ticket));
    });
  } catch (_) {
    if (requestId !== lastRequest) return;
    listMessage.textContent = 'Не удалось загрузить заявки.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  formMessage.textContent = '';
  try {
    const response = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      const issues = Object.values(data.errors || {});
      formMessage.textContent = issues.join(' / ') || data.error || 'Ошибка при сохранении';
      return;
    }
    formMessage.textContent = `Заявка №${data.ticket.id} создана`;
    form.reset();
    await loadTickets();
  } catch (_) {
    formMessage.textContent = 'Нет связи с сервером';
  }
});

list.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const response = await fetch(`/api/tickets/${button.dataset.id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: button.dataset.next })
  });
  if (!response.ok) {
    listMessage.textContent = 'Не удалось обновить статус';
    return;
  }
  await loadTickets();
});

[search, statusFilter, categoryFilter, priorityFilter].forEach((element) => element.addEventListener('input', loadTickets));
loadTickets();