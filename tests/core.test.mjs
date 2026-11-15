import assert from 'node:assert'
import * as core from '../shared/core.js'

const T = 1000000   // run=0 означает «не идёт», поэтому время в тестах начинаем не с нуля
const M = 60000
let n = 0
function t(name, f) { f(); n++; console.log('ok  ' + name) }

t('шесть занятий, ценность по умолчанию 60', () => {
  assert.equal(core.COUNT, 6)
  assert.equal(core.newState(false).val, 60)
})

t('ценность переключается по кругу 60 -> 45 -> 30 -> 60', () => {
  assert.equal(core.nextVal(60), 45)
  assert.equal(core.nextVal(45), 30)
  assert.equal(core.nextVal(30), 60)
  assert.equal(core.nextVal(77), 60)   // неизвестное значение — начинаем с начала списка
})

t('промежуток = ценность: событие через 30 минут, вибрация, отсчёт идёт дальше', () => {
  const st = core.newState(false, 30)
  core.toggle(st, 0, T)
  assert.equal(core.label(st, core.remaining(st, 0, T)), '30')
  assert.equal(core.process(st, T + 29 * M).events.length, 0)
  const r = core.process(st, T + 30 * M)
  assert.equal(r.events.length, 1)
  assert.equal(r.fresh, true)
  const ev = r.events[0]
  assert.equal(ev.k, 'b'); assert.equal(ev.f, 1); assert.equal(ev.ms, 30 * M)
  assert.equal(ev.id, 'b0-' + (T + 30 * M))
  assert.equal(core.running(st, 0), true)
  assert.equal(core.remaining(st, 0, T + 30 * M), 30 * M)   // сразу пошёл следующий промежуток
})

t('экран был выключен: пропущенные промежутки засчитываются с настоящим временем', () => {
  const st = core.newState(false, 45)
  core.toggle(st, 2, T)
  const r = core.process(st, T + 100 * M)           // прошло 2 промежутка и ещё 10 минут
  assert.equal(r.events.length, 2)
  assert.equal(r.events[1].ts, T + 90 * M)
  assert.equal(r.fresh, false)                      // давно — не вибрируем
  assert.equal(core.remaining(st, 2, T + 100 * M), 35 * M)
})

t('стоп: таймер обнуляется, на телефон уходит пройденное время', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 1, T)
  core.toggle(st, 1, T + 20 * M)                    // нажали ещё раз — стоп
  assert.equal(core.running(st, 1), false)
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].ms, 20 * M)
  assert.equal(st.out[0].f, 0)
  assert.equal(core.label(st, core.remaining(st, 1, T + 21 * M)), '60')   // снова равен ценности
})

t('стоп раньше секунды ничего не отправляет', () => {
  const st = core.newState(false)
  core.toggle(st, 1, T)
  core.toggle(st, 1, T + 500)
  assert.equal(st.out.length, 0)
})

t('запуск другого занятия останавливает прежнее и отправляет пройденное', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 0, T)
  core.toggle(st, 4, T + 12 * M)
  assert.equal(core.running(st, 0), false)
  assert.equal(core.running(st, 4), true)
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].i, 0)
  assert.equal(st.out[0].ms, 12 * M)
})

t('стоп сначала учитывает завершившийся промежуток', () => {
  const st = core.newState(false, 30)
  core.toggle(st, 3, T)
  core.toggle(st, 3, T + 40 * M)                    // 30 минут уже прошло, 10 — следующего
  assert.equal(st.out.length, 2)
  assert.equal(st.out[0].f, 1)
  assert.equal(st.out[1].ms, 10 * M)
})

t('тест: промежуток 10 секунд, но телефону уходит полная ценность', () => {
  const st = core.newState(true, 45)
  core.toggle(st, 2, T)
  assert.equal(core.label(st, core.remaining(st, 2, T)), '10')
  assert.equal(core.label(st, core.remaining(st, 2, T + 4200)), '6')
  const r = core.process(st, T + 10000)
  assert.equal(r.events.length, 1)
  assert.equal(r.events[0].ms, 45 * M)
  assert.equal(r.events[0].x, 1)
  // стоп на половине теста — половина ценности
  core.toggle(st, 2, T + 15000)
  assert.equal(st.out[st.out.length - 1].ms, Math.round(22.5 * M))
})

t('красный 15:00, зелёный 60:00, серый = ценность', () => {
  const st = core.newState(false, 30)
  core.startOverlay(st, 'r', T)
  assert.equal(core.clock(core.ovLeft(st, T)), '15:00')
  assert.equal(core.nextDue(st)[0].t, T + 15 * M)
  core.endOverlay(st)
  core.startOverlay(st, 'g', T)
  assert.equal(core.clock(core.ovLeft(st, T)), '60:00')
  core.endOverlay(st)
  core.startOverlay(st, 'y', T)
  assert.equal(core.clock(core.ovLeft(st, T)), '30:00')
  assert.equal(core.clock(core.ovLeft(st, T + 5000)), '29:55')
})

t('тест: все цветные таймеры по 10 секунд', () => {
  for (const k of ['r', 'g', 'y']) {
    const st = core.newState(true, 60)
    core.startOverlay(st, k, T)
    assert.equal(core.clock(core.ovLeft(st, T)), '00:10')
  }
})

t('красный и зелёный по окончании событий телефону не шлют', () => {
  const st = core.newState(false)
  core.startOverlay(st, 'r', T)
  const r = core.process(st, T + 15 * M)
  assert.equal(r.ovDone, true)
  assert.equal(r.ovFresh, true)
  assert.equal(st.q.s, 2)
  assert.equal(st.out.length, 0)
  assert.equal(core.anyRunning(st), false)
  assert.equal(core.overlayActive(st), true)        // экран остаётся красным, пока не закроют долгим нажатием
})

t('серый по окончании шлёт «нажатие на очередь»', () => {
  const st = core.newState(false, 30)
  core.startOverlay(st, 'y', T)
  assert.equal(core.process(st, T + 29 * M).events.length, 0)
  const r = core.process(st, T + 30 * M)
  assert.equal(r.ovDone, true)
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].k, 'q')
  // закрыли раньше времени — ничего не отправляется
  const st2 = core.newState(false, 30)
  core.startOverlay(st2, 'y', T)
  core.endOverlay(st2)
  core.process(st2, T + 60 * M)
  assert.equal(st2.out.length, 0)
})

t('запуск цветного таймера останавливает идущее занятие', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 5, T)
  core.startOverlay(st, 'r', T + 7 * M)
  assert.equal(core.running(st, 5), false)
  assert.equal(st.out[0].ms, 7 * M)
  assert.equal(core.anyRunning(st), true)
})

t('подтверждение и повторная отправка', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 0, T)
  core.process(st, T + 60 * M)
  assert.equal(core.due(st, T + 60 * M, 15000).length, 1)
  st.out[0].tried = T + 60 * M
  assert.equal(core.due(st, T + 60 * M + 1000, 15000).length, 0)
  assert.equal(core.due(st, T + 60 * M + 16000, 15000).length, 1)
  assert.equal(core.ack(st, st.out[0].id), true)
  assert.equal(st.out.length, 0)
})

t('сохранение и восстановление (в том числе старое сохранение v3)', () => {
  const st = core.newState(false, 45)
  core.toggle(st, 1, T + 100)
  core.startOverlay(core.newState(false), 'g', T)
  const back = core.restore(JSON.stringify(st), false, 60)
  assert.equal(back.val, 45)
  assert.equal(back.run[1], T + 100)
  const old = core.restore(JSON.stringify({ v: 3, rem: [1, 2, 3, 4, 5, 6, 7, 8, 9], run: [0, 0, T, 0, 0, 0, 0, 0, 0], hold: -1, q: { s: 1, run: T }, out: [{ id: '0-5', i: 0, ts: 5 }] }), false, 60)
  assert.equal(old.run[2], T)
  assert.equal(old.q.k, 'r')
  assert.equal(old.out.length, 1)
  assert.equal(core.restore('мусор', false, 30).val, 30)
  assert.equal(core.restore('', true, 60).test, true)
})

console.log('\nВсе проверки пройдены: ' + n)
