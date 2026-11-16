'use strict';

const { createApp } = require('../../src/app');

let server;
let base;

beforeEach(async () => {
  server = createApp({ seed: [] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('Базовые интеграционные тесты API', () => {
  test('GET /api/health отвечает HTTP 200', async () => {
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('POST /api/tickets создает корректную заявку', async () => {
    const response = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Сбой принтера',
        description: 'Принтер в аудитории не отвечает',
        category: 'hardware',
        priority: 'medium'
      })
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.ticket.id).toBe(1);
    expect(body.ticket.status).toBe('new');
  });
});

describe('Расширенные интеграционные тесты API (Этап 3)', () => {
  // I-01: Создание и последующее чтение того же обращения по GET + проверка нормализации
  test('POST /api/tickets сохраняет нормализованную заявку и она возвращается в GET /api/tickets', async () => {
    // Arrange
    const payload = {
      title: '  Сбой   VPN\tв   корпусе  ',
      description: '  Не удается подключиться к учебной сети  ',
      category: 'network',
      priority: 'high'
    };

    // Act
    const createRes = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const createdBody = await createRes.json();

    const listRes = await fetch(`${base}/api/tickets`);
    const listBody = await listRes.json();

    // Assert
    expect(createRes.status).toBe(201);
    expect(createdBody.ticket.title).toBe('Сбой VPN в корпусе');
    expect(listRes.status).toBe(200);
    expect(listBody.total).toBe(1);
    expect(listBody.items[0]).toMatchObject({
      id: createdBody.ticket.id,
      title: 'Сбой VPN в корпусе',
      description: 'Не удается подключиться к учебной сети',
      category: 'network',
      priority: 'high',
      status: 'new'
    });
  });

  // I-02: Ошибка валидации (HTTP 400) и неизменность состояния хранилища
  test('POST /api/tickets возвращает HTTP 400 при невалидных данных и не меняет количество заявок', async () => {
    // Arrange: создаем одну валидную заявку
    await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Исходная заявка',
        description: 'Описание исходной заявки длиной более 10 символов',
        category: 'software',
        priority: 'low'
      })
    });

    // Act: пытаемся создать заявку с темой из пробелов и коротких символов ("  ab  ")
    const badRes = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '  ab  ',
        description: 'Коротко',
        category: 'invalid_cat',
        priority: 'urgent'
      })
    });
    const badBody = await badRes.json();

    const listRes = await fetch(`${base}/api/tickets`);
    const listBody = await listRes.json();

    // Assert
    expect(badRes.status).toBe(400);
    expect(badBody.errors).toHaveProperty('title');
    expect(badBody.errors).toHaveProperty('description');
    expect(badBody.errors).toHaveProperty('category');
    expect(badBody.errors).toHaveProperty('priority');
    expect(listBody.total).toBe(1);
  });

  // I-03: Комбинация search + status + category (AND + регистронезависимость)
  test('GET /api/tickets корректно применяет комбинацию search, status и category', async () => {
    // Arrange: наполняем хранилище через API и переводим нужную заявку в in_progress
    const createTicket = async (data) => {
      const r = await fetch(`${base}/api/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      });
      return (await r.json()).ticket;
    };

    const t1 = await createTicket({
      title: 'Настройка VPN клиента',
      description: 'Требуется доступ к внутреннему контуру',
      category: 'network',
      priority: 'high'
    });
    await createTicket({
      title: 'Настройка VPN на ноутбуке',
      description: 'Остается в статусе new',
      category: 'network',
      priority: 'medium'
    });
    await createTicket({
      title: 'VPN модуль в ПО',
      description: 'Другая категория',
      category: 'software',
      priority: 'high'
    });

    await fetch(`${base}/api/tickets/${t1.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });

    // Act
    const query = new URLSearchParams({
      search: '  vpn ',
      status: 'in_progress',
      category: 'network'
    });
    const res = await fetch(`${base}/api/tickets?${query.toString()}`);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe(t1.id);
  });

  // I-04: Запрет недопустимого перехода статуса (HTTP 409), 400 и 404
  test('PATCH /api/tickets/:id/status возвращает 409 при пропуске этапа, 400 при неизвестном статусе и 404 при отсутствии ID', async () => {
    // Arrange
    const createRes = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Замена клавиатуры',
        description: 'Не работают клавиши на рабочем месте',
        category: 'hardware',
        priority: 'medium'
      })
    });
    const { ticket } = await createRes.json();

    // Act 1: попытка перескочить new -> resolved
    const conflictRes = await fetch(`${base}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' })
    });

    // Act 2: неизвестный статус
    const badStatusRes = await fetch(`${base}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'archived' })
    });

    // Act 3: несуществующий ID
    const notFoundRes = await fetch(`${base}/api/tickets/9999/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });

    // Assert
    expect(conflictRes.status).toBe(409);
    expect(badStatusRes.status).toBe(400);
    expect(notFoundRes.status).toBe(404);

    // Проверяем, что статус исходной заявки в хранилище не изменился
    const checkList = await (await fetch(`${base}/api/tickets`)).json();
    expect(checkList.items[0].status).toBe('new');
  });

  // I-05: Порядок заявок в ответе API (приоритет high -> medium -> low и новизна внутри приоритета)
  test('GET /api/tickets возвращает заявки отсортированными по приоритету и времени создания', async () => {
    // Arrange: запускаем сервер с заранее подготовленным набором заявок с разными приоритетами и датами
    await new Promise((resolve) => server.close(resolve));
    server = createApp({
      seed: [
        {
          id: 10,
          title: 'Низкий приоритет',
          description: 'Описание низкой заявки',
          category: 'hardware',
          priority: 'low',
          status: 'new',
          createdAt: '2026-10-05T10:00:00.000Z'
        },
        {
          id: 20,
          title: 'Высокий старый',
          description: 'Описание старой высокой заявки',
          category: 'network',
          priority: 'high',
          status: 'new',
          createdAt: '2026-10-01T10:00:00.000Z'
        },
        {
          id: 30,
          title: 'Средний приоритет',
          description: 'Описание средней заявки',
          category: 'software',
          priority: 'medium',
          status: 'new',
          createdAt: '2026-10-03T10:00:00.000Z'
        },
        {
          id: 40,
          title: 'Высокий новый',
          description: 'Описание новой высокой заявки',
          category: 'network',
          priority: 'high',
          status: 'new',
          createdAt: '2026-10-04T10:00:00.000Z'
        }
      ]
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    // Act
    const res = await fetch(`${base}/api/tickets`);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.items.map((item) => item.id)).toEqual([40, 20, 30, 10]);
  });
  // TDD (RED): Фильтрация заявок по параметру priority (и сочетание с другими фильтрами)
  test('GET /api/tickets?priority=high возвращает только заявки с высоким приоритетом', async () => {
    // Arrange
    await new Promise((resolve) => server.close(resolve));
    server = createApp({
      seed: [
        {
          id: 1,
          title: 'Критичный сбой сети',
          description: 'Описание критичного сбоя сети',
          category: 'network',
          priority: 'high',
          status: 'new',
          createdAt: '2026-10-01T10:00:00.000Z'
        },
        {
          id: 2,
          title: 'Обычный сбой ПО',
          description: 'Описание обычного сбоя ПО',
          category: 'software',
          priority: 'medium',
          status: 'new',
          createdAt: '2026-10-02T10:00:00.000Z'
        },
        {
          id: 3,
          title: 'Мелкая задача по оборудованию',
          description: 'Описание мелкой задачи',
          category: 'hardware',
          priority: 'low',
          status: 'new',
          createdAt: '2026-10-03T10:00:00.000Z'
        }
      ]
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    // Act
    const res = await fetch(`${base}/api/tickets?priority=high`);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items.map((item) => item.id)).toEqual([1]);
  });
});