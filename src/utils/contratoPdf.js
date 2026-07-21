import { jsPDF } from "jspdf";
import { logoAmericanetB64, logoDimB64 } from "../assets/logos_b64.js";

const EMPRESA_INFO = {
  americanet: {
    razonSocial: "AMERICANET FIBER SOLUTIONS S.A.C.",
    ruc: "20608873008",
    logo: logoAmericanetB64,
    accent: [26, 58, 107], // #1a3a6b — mismo accent usado en los reportes de la web
    nombreCorto: "AMERICANET",
  },
  dim: {
    razonSocial: "DIM INFRAESTRUCTURA Y COMUNICACIONES S.A.C.",
    ruc: "20615451208",
    logo: logoDimB64,
    accent: [15, 52, 96], // #0f3460
    nombreCorto: "DIM",
  },
};

export function empresaInfoContrato(empresa) {
  const esDim = String(empresa || "").toLowerCase().includes("dim");
  return esDim ? EMPRESA_INFO.dim : EMPRESA_INFO.americanet;
}

function fmtFechaHoraContrato(d = new Date()) {
  const fecha = d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const hora = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return { fecha, hora };
}

/**
 * Genera el contrato de servicio en PDF. Devuelve { doc, blob, filename }.
 * Las firmas se dejan en blanco (solo la linea) para firmar despues.
 */
export function generarContratoPdf({
  empresa,
  nombre,
  dni,
  direccion,
  email,
  celular,
  velocidad,
  precioPlan,
  codigo,
}) {
  const info = empresaInfoContrato(empresa);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const marginX = 14;
  const gutter = 6;
  const colW = (W - marginX * 2 - gutter) / 2;

  doc.setFont("helvetica", "normal");
  let y = 14;

  // ── Cabecera: logo + titulo ──
  try { doc.addImage(info.logo, "PNG", marginX, y, 28, 15, undefined, "MEDIUM"); } catch { /* logo no critico */ }
  doc.setTextColor(...info.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("CONTRATO DE SERVICIO DE ACCESO A INTERNET", W / 2 + 8, y + 6, { align: "center" });
  doc.setFontSize(10.5);
  doc.text("MODALIDAD PREPAGO", W / 2 + 8, y + 12, { align: "center" });
  y += 20;
  doc.setDrawColor(...info.accent);
  doc.setLineWidth(0.7);
  doc.line(marginX, y, W - marginX, y);
  y += 5;

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(info.razonSocial, marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(`RUC: ${info.ruc}`, marginX, y + 4.3);
  y += 10;

  // ── Helpers de una columna (ancho completo) ──
  const tituloClausulaFull = (texto) => {
    doc.setFillColor(...info.accent);
    doc.rect(marginX, y, W - marginX * 2, 5.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(texto.toUpperCase(), marginX + 2, y + 3.9);
    y += 8;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
  };
  const parrafoFull = (texto) => {
    const lines = doc.splitTextToSize(texto, W - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4 + 2.5;
  };
  const camposFull = (pares) => {
    doc.setFont("helvetica", "bold");
    const anchoLabel = Math.max(...pares.map(([label]) => doc.getTextWidth(`${label}:`)));
    const valorX = marginX + anchoLabel + 4;
    pares.forEach(([label, valor]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, marginX, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(valor || "-"), valorX, y);
      y += 4.6;
    });
  };

  // Clausula 1
  tituloClausulaFull("Cláusula Primera: Identificación de las Partes");
  parrafoFull(`El presente contrato se celebra entre ${info.razonSocial}, con RUC ${info.ruc}, en adelante "${info.nombreCorto}", y el abonado cuyos datos se detallan a continuación:`);
  camposFull([
    ["Nombre", nombre],
    ["DNI", dni],
    ["Dirección", direccion],
    ["Correo", email],
    ["Teléfono", celular],
  ]);
  y += 1;
  parrafoFull('A quien en adelante se le denominará "CLIENTE".');

  // Clausula 2
  tituloClausulaFull("Cláusula Segunda: Objeto del Contrato");
  parrafoFull(`${info.nombreCorto} se compromete a brindar el servicio de acceso a Internet mediante fibra óptica, en la modalidad prepago, sujeto a la disponibilidad técnica en el domicilio del abonado.`);

  // Clausula 3
  tituloClausulaFull("Cláusula Tercera: Características del Servicio");
  camposFull([
    ["Plan contratado", `Internet Fibra ${velocidad || "-"}`],
    ["Vel. máx. ofrecida", `${velocidad || "-"} (subida y bajada)`],
    ["Vel. mín. garantizada", "70% de la velocidad máxima"],
    ["Precio del período", `S/ ${Number(precioPlan || 0).toFixed(2)} (pago anticipado)`],
  ]);
  y += 1;

  // Clausula 4
  tituloClausulaFull("Cláusula Cuarta: Instalación y Equipos");
  parrafoFull(`La instalación incluye cableado estándar y activación del servicio. El equipo instalado (ONU o router) es propiedad de ${info.nombreCorto} y se entrega en calidad de COMODATO, debiendo ser devuelto en caso de cese del servicio.`);

  // Clausula 5
  tituloClausulaFull("Cláusula Quinta: Modalidad Prepago");
  parrafoFull(`El servicio opera bajo la modalidad prepago. La continuidad del servicio depende del pago anticipado correspondiente. ${info.nombreCorto} no tiene obligación de mantener activo el servicio en caso de falta de pago.`);

  // ── Dos columnas: 6-7 izquierda, 8-9-10 derecha ──
  const yColStart = y;
  const xLeft = marginX;
  const xRight = marginX + colW + gutter;

  const makeCol = (x) => {
    const st = { y: yColStart };
    const titulo = (texto) => {
      doc.setFillColor(...info.accent);
      const lines0 = doc.splitTextToSize(texto.toUpperCase(), colW - 4);
      const h = lines0.length * 3.6 + 2.8;
      doc.rect(x, st.y, colW, h, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.6);
      doc.text(lines0, x + 2, st.y + 3.6);
      st.y += h + 2.2;
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
    };
    const parrafo = (texto) => {
      const lines = doc.splitTextToSize(texto, colW - 2);
      doc.text(lines, x, st.y);
      st.y += lines.length * 3.5 + 2.2;
    };
    const bullets = (items) => {
      items.forEach((it) => {
        const lines = doc.splitTextToSize(`• ${it}`, colW - 2);
        doc.text(lines, x, st.y);
        st.y += lines.length * 3.5 + 0.8;
      });
      st.y += 1.2;
    };
    return { st, titulo, parrafo, bullets };
  };

  const left = makeCol(xLeft);
  left.titulo("Cláusula Sexta: Permanencia Mínima y Penalidades");
  left.parrafo(`El CLIENTE acepta una permanencia mínima de 3 meses. En caso de baja anticipada, deberá abonar S/ ${Number(precioPlan || 0).toFixed(2)} por cada mes restante. Asimismo, deberá devolver todos los equipos proporcionados.`);
  left.titulo("Cláusula Séptima: Obligaciones del Cliente");
  left.bullets([
    "Realizar los pagos anticipados para mantener el servicio activo.",
    "No revender ni compartir el servicio fuera del domicilio autorizado.",
    "Conservar en buen estado los equipos entregados en comodato.",
    "Devolver el equipo al término del servicio.",
  ]);

  const right = makeCol(xRight);
  right.titulo("Cláusula Octava: Atención y Reclamos");
  right.parrafo("La atención al cliente se brinda a través del canal de WhatsApp 950485133 o mediante la plataforma web americanet.club/cliente.");
  right.titulo("Cláusula Novena: Protección de Datos Personales");
  right.parrafo("El cliente autoriza el uso de sus datos personales para fines operativos, comerciales y de soporte, conforme a la Ley N.º 29733.");
  right.titulo("Cláusula Décima: Aceptación");
  right.parrafo("El cliente declara haber leído y aceptado los términos del presente contrato, procediendo a su firma como señal de conformidad.");

  y = Math.max(left.st.y, right.st.y) + 8;

  // ── Firmas (en blanco) ──
  const firmaW = 70;
  const firmaYLinea = y + 14;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.line(marginX + 8, firmaYLinea, marginX + 8 + firmaW, firmaYLinea);
  doc.line(W - marginX - 8 - firmaW, firmaYLinea, W - marginX - 8, firmaYLinea);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text("Firma del Cliente", marginX + 8 + firmaW / 2, firmaYLinea + 4.5, { align: "center" });
  doc.text(`Firma ${info.nombreCorto}`, W - marginX - 8 - firmaW / 2, firmaYLinea + 4.5, { align: "center" });

  // ── Pie: fecha, hora, lugar ──
  const { fecha, hora } = fmtFechaHoraContrato();
  doc.setFontSize(8.5);
  doc.text(`Arequipa, ${fecha} · Hora: ${hora}`, W / 2, firmaYLinea + 14, { align: "center" });

  const dniLimpio = String(dni || "").replace(/\D/g, "") || "sin-dni";
  const codigoLimpio = String(codigo || "").replace(/[^a-zA-Z0-9-]/g, "") || Date.now();
  const filename = `Contrato-${dniLimpio}-${codigoLimpio}.pdf`;
  const blob = doc.output("blob");
  return { doc, blob, filename };
}
