const generalDocs = [
  "Formato de alta", "Solicitud de empleo", "Copia del acta de nacimiento", "Número de IMSS", "CURP",
  "Copia de comprobante de estudios", "Copia de comprobante de domicilio", "Credencial de elector",
  "Guía de entrevista", "Carta de identidad (solo menores)"
];

const empresaDocs = [
  "Permiso firmado por tutor", "Identificación oficial tutor", "Carta responsiva", "Políticas de la empresa",
  "Políticas de propina", "Convenio de manipulaciones", "Convenio de correo electrónico", "Vale de uniforme",
  "Apertura de cuentas", "Contrato laboral", "Responsiva tarjeta de nómina", "Cuenta Santander"
];

const CLIENT_ID = '447789838113-076qo17ps0bercefg0ln9kiokt9bodtv.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let authInstance;
const images = {};
let zipBlob = null;

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
  initGoogleAPI();
};

function isImageBlurry(canvas, threshold = 20) {
  const context = canvas.getContext("2d");
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const grayValues = [];

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const gray = (r + g + b) / 3;
    grayValues.push(gray);
  }

  const avg = grayValues.reduce((a, b) => a + b, 0) / grayValues.length;
  const variance = grayValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / grayValues.length;

  return variance < threshold;
}

async function openCamera(docName) {
  const video = document.getElementById("camera");
  const modal = document.getElementById("cameraModal");
  const label = document.getElementById("docLabel");
  const canvas = document.getElementById("snapshotCanvas");

  label.textContent = `📄 Escaneando: ${docName}`;
  modal.hidden = false;
  modal.style.display = "flex";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;

    const oldBtn = document.getElementById("captureBtn");
    const newBtn = oldBtn.cloneNode(true);
    newBtn.id = "captureBtn";
    oldBtn.replaceWith(newBtn);

    newBtn.onclick = () => {
      const context = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        if (isImageBlurry(canvas)) {
          alert("⚠️ La imagen parece borrosa. Toma la foto nuevamente.");
          return;
        }

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

document.getElementById("minimizeCamera").onclick = () => {
  const modal = document.getElementById("cameraModal");
  modal.style.display = "none";
};

document.getElementById("generateZip").onclick = async () => {
  let baseName = document.getElementById("zipName").value.trim();
  if (!baseName) return alert("⚠️ Ingresa un nombre para el ZIP");

  if (Object.keys(images).length === 0) return alert("⚠️ No hay imágenes para generar el ZIP.");

  const fecha = new Date().toISOString().slice(0, 10);
  const zipName = `${baseName}_${fecha}`;

  const zip = new JSZip();
  for (const [docName, blob] of Object.entries(images)) {
    const fileName = docName.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_") + ".jpg";
    zip.file(fileName, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  zipBlob = content;

  const blobURL = URL.createObjectURL(content);
  document.zipBlobURL = blobURL;
  document.generatedZipName = zipName;

  const a = document.createElement("a");
  a.href = blobURL;
  a.download = zipName + ".zip";
  a.click();

  alert("✅ ZIP generado y descargado. Puedes compartirlo por WhatsApp, correo o Drive.");
};

document.getElementById("btnWhatsApp").onclick = async () => {
  if (!zipBlob) return alert("Primero genera el ZIP.");

  const baseName = document.getElementById("zipName").value.trim() || "documentos";
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreZip = `${baseName}_${fecha}.zip`;
  const nombreTrabajador = prompt("Nombre del trabajador:");

  try {
    const file = new File([zipBlob], nombreZip, { type: "application/zip" });
    const storageRef = ref(storage, `zips/${nombreZip}`);
    await uploadBytes(storageRef, file);

    const downloadURL = await getDownloadURL(storageRef);

    const mensaje = encodeURIComponent(
      `Hola, aquí tienes el ZIP con documentos del trabajador ${nombreTrabajador || ""}:\n${downloadURL}`
    );

    window.open(`https://wa.me/?text=${mensaje}`, "_blank");
  } catch (error) {
    console.error("❌ Error al subir el archivo a Firebase:", error);
    alert("❌ No se pudo subir ni generar el enlace de descarga.");
  }
};

document.getElementById("sendEmail").onclick = async () => {
  if (!zipBlob) {
    alert("Primero genera el ZIP.");
    return;
  }

  const baseName = document.getElementById("zipName").value.trim() || "documentos";
  const fecha = new Date().toISOString().slice(0, 10);
  const zipName = `${baseName}_${fecha}`;

  const link = await uploadZipToDrive(zipBlob, zipName + ".zip");
  if (!link) return;

  const subject = encodeURIComponent("📁 Documentos escaneados");
  const body = encodeURIComponent(`Hola,\n\nAquí tienes el ZIP:\n${link}`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

document.getElementById("shareDrive").onclick = async () => {
  if (!zipBlob) {
    alert("Primero genera el ZIP.");
    return;
  }

  const baseName = document.getElementById("zipName").value.trim() || "documentos";
  const fecha = new Date().toISOString().slice(0, 10);
  const zipName = `${baseName}_${fecha}.zip`;

  const link = await uploadZipToDrive(zipBlob, zipName);
  if (!link) return;

  alert(`✅ Archivo subido a Google Drive:\n${link}`);
};

function initGoogleAPI() {
  gapi.load('client:auth2', async () => {
    await gapi.client.init({ clientId: CLIENT_ID, scope: SCOPES });
    authInstance = gapi.auth2.getAuthInstance();
  });
}

async function uploadZipToDrive(blob, filename) {
  try {
    await authInstance.signIn();
    const accessToken = gapi.auth.getToken().access_token;

    const metadata = {
      name: filename,
      mimeType: 'application/zip'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: new Headers({ Authorization: 'Bearer ' + accessToken }),
        body: form
      }
    );

    const file = await response.json();

    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    return `https://drive.google.com/file/d/${file.id}/view?usp=sharing`;
  } catch (error) {
    alert("❌ Error subiendo a Google Drive: " + error.message);
    return null;
  }
}
