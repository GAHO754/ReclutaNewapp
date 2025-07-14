const documents = [
    "Formato de alta", "Solicitud de empleo", "Copia del acta de nacimiento", "Número de IMSS", "CURP",
    "Copia de comprobante de estudios", "Copia de comprobante de domicilio", "Credencial de elector (Frente)",
    "Credencial de elector (Reverso)", "Guía de entrevista", "Carta de identidad (solo menores)",
    "Permiso firmado por tutor", "Identificación oficial tutor", "Carta responsiva", "Políticas de la empresa",
    "Políticas de propina", "Convenio de manipulaciones", "Convenio de correo electrónico", "Vale de uniforme",
    "Apertura de cuentas", "Contrato laboral", "Responsiva tarjeta de nómina", "Cuenta Santander"
];

const scannedImages = {};
let cropper = null;
let currentDocForCrop = null;
let currentLiveDoc = null;
let liveStream = null;
let cv = null; // Variable para la instancia de OpenCV

// Esta función se llama cuando OpenCV.js ha terminado de cargar
function onOpenCvReady() {
    cv = window.cv; // Asigna la instancia de OpenCV a la variable global 'cv'
    if (cv) {
        console.log("OpenCV.js está listo!");
        // Aquí puedes realizar cualquier inicialización adicional que necesites de OpenCV
    } else {
        console.error("Error al cargar OpenCV.js");
        alert("Hubo un problema al cargar la librería de procesamiento de imágenes.");
    }
}

window.onload = () => {
    const container = document.getElementById('document-container');

    documents.forEach((docName, index) => {
        const div = document.createElement('div');
        div.className = 'document-box';
        div.innerHTML = `
            <label>${index + 1}. ${docName}</label><br>
            <button onclick="startLiveCamera('${docName}')">📸 Escanear</button>
            <span id="status-${docName}">❌</span>
            <img id="preview-${docName}" class="image-preview" style="display:none;">
            <button onclick="openCrop('${docName}')">✂️ Recortar (manual)</button>
        `;
        container.appendChild(div);
    });

    // Crear contenedor flex para título + botón
    const header = document.createElement('div');
    header.id = 'header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '10px';
    header.style.marginBottom = '20px';

    // Buscar el título h1 en el DOM
    const title = document.querySelector('h1');

    if (title) {
        // Mover el título dentro del nuevo contenedor
        title.parentNode.insertBefore(header, title);
        header.appendChild(title);

        // Crear el botón regresar
        const backBtn = document.createElement('button');
        backBtn.textContent = '⬅️ Regresar';
        backBtn.style.padding = '5px 10px';
        backBtn.style.cursor = 'pointer';
        backBtn.onclick = () => {
            window.location.href = 'dashboard.html';
        };

        // Agregar el botón al contenedor header, junto al título
        header.appendChild(backBtn);
    }
};

function startLiveCamera(docName) {
    currentLiveDoc = docName;

    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    })
    .then((stream) => {
        liveStream = stream;
        document.getElementById("live-video").srcObject = stream;
        document.getElementById("live-camera-modal").style.display = "flex";
    })
    .catch((error) => {
        console.error("Error accediendo a la cámara:", error);
        alert("No se pudo acceder a la cámara de este dispositivo. Asegúrate de dar permisos.");
    });
}


//////////////////////////////////////////////////////////////////////////
function takePhoto() {
    const video = document.getElementById("live-video");
    const canvas = document.createElement("canvas");
    // Usa el tamaño real del video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    closeLiveCamera();

    if (!cv) {
        alert("OpenCV.js no está cargado.");
        const imageDataURL = canvas.toDataURL("image/jpeg", 1.0);
        scannedImages[currentLiveDoc] = imageDataURL;
        document.getElementById(`preview-${currentLiveDoc}`).src = imageDataURL;
        document.getElementById(`preview-${currentLiveDoc}`).style.display = 'block';
        document.getElementById(`status-${currentLiveDoc}`).textContent = '⚠️';
        return;
    }

    processImageWithOpenCV(canvas, currentLiveDoc);
}


////////////////////////////////////////////////////////////////////////////////////////////////
function closeLiveCamera() {
    document.getElementById("live-camera-modal").style.display = "none";
    if (liveStream) {
        liveStream.getTracks().forEach(track => track.stop());
        liveStream = null;
    }
}

function processImageWithOpenCV(canvasElement, docName) {
    console.log("Iniciando procesamiento con OpenCV.js...");

    let src = cv.imread(canvasElement); // Carga la imagen del canvas en una Mat de OpenCV
    let dst = new cv.Mat();
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let canny = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    try {
        // 1. Convertir a escala de grises
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        // 2. Aplicar un desenfoque para suavizar la imagen y reducir el ruido
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

        // 3. Detección de bordes con Canny
        cv.Canny(blurred, canny, 75, 200, 3, false); // Ajustar umbrales si es necesario

        // 4. Encontrar contornos
        cv.findContours(canny, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = 0;
        let bestContour = null;

        // 5. Encontrar el contorno más grande que sea aproximadamente un rectángulo de 4 puntos
        for (let i = 0; i < contours.size(); ++i) {
            let contour = contours.get(i);
            let area = cv.contourArea(contour);
            // Solo considerar contornos de un cierto tamaño mínimo para evitar ruido
            if (area < 1000) continue;

            let perimeter = cv.arcLength(contour, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

            // Si el contorno tiene 4 puntos
            if (approx.rows === 4) {
                if (area > maxArea) {
                    maxArea = area;
                    bestContour = approx;
                }
            }
            approx.delete();
        }

        if (bestContour) {
            // 6. Preparar los puntos de origen para la transformación de perspectiva
            let points = [];
            for (let i = 0; i < bestContour.rows; ++i) {
                points.push({ x: bestContour.data32S[i * 2], y: bestContour.data32S[i * 2 + 1] });
            }

            // Función auxiliar para ordenar los 4 puntos (superior-izq, superior-der, inferio-der, inferior-izq)
            function orderPoints(pts) {
                let rect = new Array(4);
                let s = pts.map(p => p.x + p.y);
                let diff = pts.map(p => p.y - p.x);

                rect[0] = pts[s.indexOf(Math.min(...s))]; // Top-left
                rect[2] = pts[s.indexOf(Math.max(...s))]; // Bottom-right
                rect[1] = pts[diff.indexOf(Math.min(...diff))]; // Top-right
                rect[3] = pts[diff.indexOf(Math.max(...diff))]; // Bottom-left

                return rect;
            }

            let orderedPts = orderPoints(points);
            let [tl, tr, br, bl] = orderedPts;

            // Calcular el ancho y alto del nuevo documento "aplanado"
            let widthA = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
            let widthB = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
            let maxWidth = Math.max(parseInt(widthA), parseInt(widthB));

            let heightA = Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2));
            let heightB = Math.sqrt(Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2));
            let maxHeight = Math.max(parseInt(heightA), parseInt(heightB));

            // Puntos de destino para la transformación (un rectángulo perfecto)
            let destCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                maxWidth - 1, 0,
                maxWidth - 1, maxHeight - 1,
                0, maxHeight - 1
            ]);
            let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
                tl.x, tl.y,
                tr.x, tr.y,
                br.x, br.y,
                bl.x, bl.y
            ]);

            // 7. Realizar la transformación de perspectiva
            let M = cv.getPerspectiveTransform(srcCoords, destCoords);
            let dsize = new cv.Size(maxWidth, maxHeight);
            cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            // Limpieza de memoria
            srcCoords.delete();
            destCoords.delete();
            M.delete();
            bestContour.delete();

            // 8. Opcional: Aplicar binarización si es el Contrato laboral para mejorar legibilidad de texto pequeño
            const finalCanvas = document.createElement('canvas');
            if (docName === "Contrato laboral") {
                let tempGrayForBinarization = new cv.Mat();
                let binarizedMat = new cv.Mat();
                // Convertir 'dst' a escala de grises si no lo está ya, para la binarización
                cv.cvtColor(dst, tempGrayForBinarization, cv.COLOR_RGBA2GRAY, 0);
                // Aplicar Otsu's thresholding (binarización automática)
                cv.threshold(tempGrayForBinarization, binarizedMat, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                cv.imshow(finalCanvas, binarizedMat); // Dibuja la Mat binarizada
                tempGrayForBinarization.delete();
                binarizedMat.delete();
            } else {
                cv.imshow(finalCanvas, dst); // Para otros documentos, solo muestra la imagen recortada
            }

            // Calidad JPEG: 1.0 para Contrato laboral, 0.7 para los demás
            const processedDataURL = finalCanvas.toDataURL("image/jpeg", docName === "Contrato laboral" ? 1.0 : 0.7);

            scannedImages[docName] = processedDataURL;
            document.getElementById(`preview-${docName}`).src = processedDataURL;
            document.getElementById(`preview-${docName}`).style.display = 'block';
            document.getElementById(`status-${docName}`).textContent = '✅'; // Procesado automáticamente
        } else {
            console.warn("No se pudo detectar un documento rectangular. Se guardará la imagen sin procesar.");
            alert("No se detectó un documento claro. Se guardará la imagen completa. Puedes usar la opción 'Recortar (manual)' si es necesario.");
            // Calidad de la imagen original si no se puede procesar automáticamente
            const originalDataURL = canvasElement.toDataURL("image/jpeg", currentLiveDoc === "Contrato laboral" ? 1.0 : 0.7);
            scannedImages[docName] = originalDataURL;
            document.getElementById(`preview-${docName}`).src = originalDataURL;
            document.getElementById(`preview-${docName}`).style.display = 'block';
            document.getElementById(`status-${docName}`).textContent = '⚠️'; // Indicador de que no se pudo procesar automáticamente
        }

    } catch (err) {
        console.error("Error durante el procesamiento OpenCV:", err);
        alert("Ocurrió un error al procesar la imagen automáticamente.");
        // En caso de error, guarda la imagen original para que el usuario pueda intentar el recorte manual
        const originalDataURL = canvasElement.toDataURL("image/jpeg", currentLiveDoc === "Contrato laboral" ? 1.0 : 0.7);
        scannedImages[docName] = originalDataURL;
        document.getElementById(`preview-${docName}`).src = originalDataURL;
        document.getElementById(`preview-${docName}`).style.display = 'block';
        document.getElementById(`status-${docName}`).textContent = '❌';
    } finally {
        // Asegúrate de liberar la memoria de las Mats de OpenCV
        src.delete();
        dst.delete();
        gray.delete();
        blurred.delete();
        canny.delete();
        contours.delete();
        hierarchy.delete();
    }
}

function openCrop(docName) {
    const imageSrc = scannedImages[docName];
    if (!imageSrc) {
        alert("Primero escanea la imagen.");
        return;
    }

    currentDocForCrop = docName;
    const cropperImg = document.getElementById("cropper-image");

    document.getElementById("cropper-modal").style.display = "flex";

    if (cropper) {
        cropper.destroy();
        cropper = null;
    }

    cropperImg.src = ""; // Limpiar cualquier imagen previa para forzar el onload

    cropperImg.onload = () => {
        if (cropperImg.src) {
            cropper = new Cropper(cropperImg, {
                viewMode: 1,
                autoCropArea: 0.8,
                responsive: true,
                background: false,
                movable: true,
                zoomable: true
            });
        }
    };
    cropperImg.src = imageSrc;

    cropperImg.onerror = () => {
        console.error("Error cargando la imagen para recortar:", imageSrc);
        alert("Hubo un problema cargando la imagen para recortar.");
        closeCrop();
    };
}


function confirmCrop() {
    if (!cropper) {
        alert("Cropper no está activo.");
        return;
    }

    const canvas = cropper.getCroppedCanvas();
    if (!canvas) {
        alert("No se pudo obtener el área recortada.");
        return;
    }

   // Calidad JPEG al confirmar recorte manual con redimensionamiento:
let finalCanvas = canvas;

if (currentDocForCrop !== "Contrato laboral") {
    finalCanvas = resizeCanvas(canvas, 900, 1200);
}

const quality = currentDocForCrop === "Contrato laboral" ? 1.0 : 0.7; // Ajusta calidad aquí si quieres

const croppedDataUrl = finalCanvas.toDataURL("image/jpeg", quality);

scannedImages[currentDocForCrop] = croppedDataUrl;
document.getElementById(`preview-${currentDocForCrop}`).src = croppedDataUrl;
document.getElementById(`status-${currentDocForCrop}`).textContent = '🟩';
closeCrop();


}

function closeCrop() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    document.getElementById("cropper-modal").style.display = "none";
}
/////////////////////////////////zip////////////////////////////////////////////
async function generateZip() {
    const imss = document.getElementById('input-imss').value.trim();
    if (!imss) {
        alert("Por favor, ingresa el Número de IMSS antes de generar el ZIP.");
        return;
    }

    const fecha = getCurrentDateFormatted();
    const zip = new JSZip();

    Object.entries(scannedImages).forEach(([docName, imageData], index) => {
        const base64 = imageData.split(",")[1]; // Extrae datos sin encabezado
        zip.file(`${imss}_${fecha}_${index + 1}_${docName}.jpg`, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: 'blob' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Documentos_${imss}_${fecha}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}



//////////////////////////////////////////pdf////////////////////////////////////////////
async function generateOptimizedPDF() {
    const { jsPDF } = window.jspdf;
    const imss = document.getElementById('input-imss').value.trim();
    if (!imss) {
        alert("Por favor, ingresa el Número de IMSS antes de generar el PDF.");
        return;
    }

    const fecha = getCurrentDateFormatted();
    const pdf = new jsPDF();

    const entries = Object.entries(scannedImages);
    for (let i = 0; i < entries.length; i++) {
        const [docName, imageData] = entries[i];

        const imgProps = pdf.getImageProperties(imageData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${imss}_${fecha}_Documentos.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}




////////////////////////////////////////////////////////////////
function compressImage(dataURL, quality) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
            resolve(compressedDataUrl);
        };
        img.src = dataURL;
    });
}




// Función auxiliar para obtener fecha formateada
function getCurrentDateFormatted() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}


cropperImg.onload = null;
cropperImg.src = "";
setTimeout(() => {
    cropperImg.src = imageSrc;
    cropperImg.onload = () => {
        cropper = new Cropper(cropperImg, {
            viewMode: 1,
            autoCropArea: 0.8,
            responsive: true,
            background: false,
            movable: true,
            zoomable: true
        });
    };
}, 50);
