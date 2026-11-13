import OrdenChat from "./OrdenChat";

// Chat directo tecnico <-> oficina (gestoras + admin), separado del chat
// por orden. Desde 2026-11-12 usa el MISMO componente que el chat de orden
// (OrdenChat con "hiloTecnico"), igual que la app movil: asi tiene citas,
// reacciones, editar, fotos con zoom, ubicacion, urgente, etc.
export default function ChatTecnico({ tecnicoNombre, autor, autorRol, llenar = false }) {
  if (!tecnicoNombre) return null;
  return <OrdenChat hiloTecnico={tecnicoNombre} autor={autor} autorRol={autorRol} llenar={llenar} />;
}
