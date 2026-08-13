async page => page.evaluate(async () => {
  const response = await fetch('/events/grid?folder=operations&table=orders');
  const body = await response.json();
  return { status: response.status, body };
})
