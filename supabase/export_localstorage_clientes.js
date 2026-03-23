/*
Run this script in browser DevTools Console where your app is open.
It exports localStorage "clientes" to a JSON file.
*/

(() => {
  const raw = localStorage.getItem("clientes");
  if (!raw) {
    console.error('No existe localStorage["clientes"].');
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("No se pudo parsear clientes:", err);
    return;
  }

  if (!Array.isArray(data)) {
    console.error('localStorage["clientes"] no es un arreglo.');
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    total: data.length,
    clientes: data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clientes_export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  console.log(`Export completado: ${data.length} clientes.`);
})();

