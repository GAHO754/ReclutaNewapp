const generalDocs = [
  "FORMATO DE ALTA",
  "SOLICITUD DE EMPLEO",
  "COPIA DEL ACTA DE NACIMIENTO",
  "NUMERO DE IMSS",
  "CURP",
  "COPIA DE COMPROBANTE DE ESTUDIOS",
  "COPIA DE COMPROBANTE DE DOMICILIO",
  "CREDENCIAL DE ELECTOR",
  "GUIA DE ENTREVISTA",
  "CARTA DE IDENTIDAD(SOLO MENORES)"
];

const empresaDocs = [
  "PERMISO FIRMADO POR TUTOR",
  "IDENTIFICACION OFICIAL TUTOR",
  "CARTA RESPONSIVA",
  "POLITICAS DE LA EMPRESA",
  "POLITICAS DE PROPINA",
  "CONVENIO DE MANIPULACIONES",
  "CONVENIO DE CORREO ELECTRONICO",
  "VALE DE UNIFORME",
  "APERTURA DE CUENTAS",
  "CONTRATO LABORAL",
  "RESPONSIVA TARJETA DE NOMINA",
  "CUENTA SANTANDER"
];

const images = {}; // Guardará nombre => blob

function renderList(docs, containerId) {
  const ul = document.getElementById(containerId);
  docs.forEach(doc => {
    const safeId = doc.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="doc-label">${doc}</span>
      <span class="doc-status" id="status-${safeId}">❌</span>
      <button onclick="openCamera('${doc}')">📷 Escanear</button>
    `;
    ul.appendChild(li);
  });
}

window.onload = () => {
  renderList(generalDocs, "doc-general");
  renderList(empresaDocs, "doc-empresa");
};

async function openCamera(docName) {
  const video = document.getElementById("camera");
  const modal = document.getElementById("cameraModal");
  const captureBtn = document.getElementById("captureBtn");
  const label = document.getElementById("docLabel");
  const canvas = document.getElementById("snapshotCanvas");

  label.textContent = `📄 Escaneando: ${docName}`;
  modal.hidden = false;
  modal.style.display = "flex"; // Restaurar si estaba minimizado

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;

    captureBtn.onclick = () => {
      const context = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        images[docName] = blob;

        const safeId = docName.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
        const statusSpan = document.getElementById(`status-${safeId}`);
        if (statusSpan) statusSpan.textContent = "✅";

        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        modal.hidden = true;
      }, "image/jpeg", 0.9);
    };
  } catch (err) {
    alert("🚫 Error al activar la cámara: " + err.message);
    modal.hidden = true;
  }
}

document.getElementById("closeCamera").onclick = () => {
  const video = document.getElementById("camera");
  const modal = document.getElementById("cameraModal");

  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  modal.hidden = true;
  modal.style.display = "flex";
};

document.getElementById("minimizeCamera").onclick = () => {
  const modal = document.getElementById("cameraModal");
  modal.style.display = "none";
};

document.getElementById("generateZip").onclick = async () => {
  const zipName = document.getElementById("zipName").value.trim();
  if (!zipName) {
    alert("Por favor ingresa un nombre para el archivo ZIP");
    return;
  }

  if (Object.keys(images).length === 0) {
    alert("No hay imágenes escaneadas para generar el ZIP.");
    return;
  }

  const zip = new JSZip();
  for (const [docName, blob] of Object.entries(images)) {
    const fileName = docName.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_") + ".jpg";
    zip.file(fileName, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const zipBlobURL = URL.createObjectURL(content);

  document.zipBlob = content;
  document.zipBlobURL = zipBlobURL;

  const a = document.createElement("a");
  a.href = zipBlobURL;
  a.download = zipName + ".zip";
  a.click();

  alert("✅ El archivo ZIP ha sido descargado. Ahora puedes compartirlo por correo o WhatsApp.");
};

document.getElementById("sendWhatsApp").onclick = () => {
  if (!document.zipBlobURL) {
    alert("Primero genera el archivo ZIP.");
    return;
  }

  const msg = encodeURIComponent("Aquí está el ZIP de documentos generado.");
  window.open(`https://wa.me/?text=${msg}`);
};

document.getElementById("sendEmail").onclick = () => {
  if (!document.zipBlobURL) {
    alert("Primero genera el archivo ZIP.");
    return;
  }

  const subject = encodeURIComponent("Documentos escaneados");
  const body = encodeURIComponent("Adjunta el archivo ZIP descargado anteriormente para enviar por correo.");
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
};
