const form = document.getElementById('transaction-form');
const list = document.getElementById('transactions');

const balanceEl = document.getElementById('balance');
const incomeEl = document.getElementById('income');
const expensesEl = document.getElementById('expenses');
const mobileUrlEl = document.getElementById('mobile-url');

let transactions = [
  { title: 'Gehalt', amount: 2800, type: 'income' },
  { title: 'Miete', amount: 950, type: 'expense' },
  { title: 'Supermarkt', amount: 142.5, type: 'expense' }
];

function euro(value) {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function setMobilePreviewUrl() {
  if (!mobileUrlEl) return;
  const { protocol, hostname, port, pathname } = window.location;
  const path = pathname.endsWith('/') ? pathname : pathname.replace(/\/[^/]*$/, '/');
  const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${path}`;
  mobileUrlEl.textContent = url;
}

function render() {
  list.innerHTML = '';

  let income = 0;
  let expenses = 0;

  transactions.forEach((tx) => {
    if (tx.type === 'income') income += tx.amount;
    else expenses += tx.amount;

    const li = document.createElement('li');
    li.innerHTML = `<span>${tx.title}</span><strong class="${tx.type === 'income' ? 'positive' : 'negative'}">${tx.type === 'income' ? '+' : '-'} ${euro(tx.amount)}</strong>`;
    list.appendChild(li);
  });

  const balance = income - expenses;
  balanceEl.textContent = euro(balance);
  incomeEl.textContent = euro(income);
  expensesEl.textContent = euro(expenses);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value.trim();
  const amount = Number(document.getElementById('amount').value);
  const type = document.getElementById('type').value;

  if (!title || amount <= 0) return;

  transactions.unshift({ title, amount, type });
  form.reset();
  render();
});

render();
setMobilePreviewUrl();
