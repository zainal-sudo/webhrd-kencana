/** Diadaptasi dari source-tanpa-bawahan.html. Rumus, PDF, dan teks hasil dipertahankan. */
export function initializeForm(document, jsPDF, restoreIdentity, deliverResult) {

const aspekData = [
    { nama: "Hasil Pekerjaan", detail: "diperbandingkan dengan target pencapaian" },
    { nama: "Attitude pada Perusahaan", detail: "sikap, cara berfikir & tindakan" },
    { nama: "Kerjasama", detail: "teamwork & kolaborasi" },
    { nama: "Tanggung Jawab", detail: "dari hasil pekerjaan, beban kerja ekstra, perawatan alat kerja dan kebersihan lingkungan kerja" },
    { nama: "Inisiatif", detail: "proaktif & kemandirian" }
];

let currentScores = [null, null, null, null, null];
let aspekElements = [];
let isProcessing = false;

function toast(msg) {
    const t = document.getElementById('toastMsg');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function getKeteranganByAspek(aspekIndex, skor) {
    const nama = aspekData[aspekIndex].nama;
    if (skor === null || skor === undefined) return "☐ Belum dipilih";
    
    if (nama === "Hasil Pekerjaan") {
        if (skor === 5) return "✨ Selalu lebih dari yang diharapkan (diatas target pencapaian)";
        else if (skor === 4) return "✅ Kadang – kadang lebih dari target pencapaian";
        else if (skor === 3) return "📌 Sesuai dengan target yang ditetapkan";
        else if (skor === 2) return "⚠️ Dapat diterima, tapi kadang – kadang membuat kesalahan";
        else return "❌ Jauh dari target yang ditetapkan";
    } else if (nama === "Attitude pada Perusahaan") {
        if (skor === 5) return "✨ Selalu mempunyai reaksi positif dan bersemangat dalam bekerja";
        else if (skor === 4) return "✅ Reaksi positif cukup banyak";
        else if (skor === 3) return "📌 Reaksi positif biasa saja";
        else if (skor === 2) return "⚠️ Kadang – kadang mempunyai reaksi positif / negatif";
        else return "❌ Sering mempunyai reaksi negatif";
    } else if (nama === "Kerjasama") {
        if (skor === 5) return "✨ Mudah & dapat mengajak orang lain bekerja sama";
        else if (skor === 4) return "✅ Mudah bekerja sama & membantu orang lain";
        else if (skor === 3) return "📌 Bisa bekerja sama";
        else if (skor === 2) return "⚠️ Kadang – kadang bisa bekerja sama";
        else return "❌ Sulit untuk bekerja sama";
    } else if (nama === "Tanggung Jawab") {
        if (skor === 5) return "✨ Bertanggung jawab penuh (bertanggung jawab dalam perawatan alat kerja, kebersihan area, tidak pernah mengeluh tentang pekerjaannya)";
        else if (skor === 4) return "✅ Lebih bertanggung jawab (tidak pernah mengeluh tentang pekerjaan, mampu merawat alat kerja dan lingkungan dengan baik)";
        else if (skor === 3) return "📌 Bertanggung jawab sesuai tugas-tugas pokoknya";
        else if (skor === 2) return "⚠️ Kurang bertanggung jawab (terkadang mengeluh tentang pekerjaan maupun lingkungan kerjanya)";
        else return "❌ Tidak bertanggung jawab (sering mengeluh tentang pekerjaan, fasilitas, lingkungan kerja maupun bagian kerja lainnya)";
    } else if (nama === "Inisiatif") {
        if (skor === 5) return "✨ Sering mengambil inisiatif & produktif";
        else if (skor === 4) return "✅ Kadang-kadang berinisiatif";
        else if (skor === 3) return "📌 Kerja rutin saja dengan baik";
        else if (skor === 2) return "⚠️ Perlu dorongan untuk pekerjaan rutin";
        else return "❌ Selalu menunggu perintah";
    }
    return "";
}

function buildAspekUI() {
    const container = document.getElementById("aspekContainer");
    container.innerHTML = "";
    aspekElements = [];
    
    for (let i = 0; i < aspekData.length; i++) {
        const item = aspekData[i];
        const card = document.createElement("div");
        card.className = "aspek-item no-selected";
        card.id = `aspekCard_${i}`;
        
        const headerDiv = document.createElement("div");
        headerDiv.className = "aspek-header";
        headerDiv.innerHTML = `
            <div class="aspek-nama"><span class="num">${i+1}.</span> ${item.nama}</div>
            <div class="bobot"><i class="fas fa-times"></i> Bobot x2</div>
        `;
        card.appendChild(headerDiv);
        
        const detailDiv = document.createElement("div");
        detailDiv.className = "aspek-detail";
        detailDiv.innerHTML = `<i class="fas fa-chevron-right" style="font-size:8px;margin-right:4px;color:var(--primary);"></i> ${item.detail}`;
        card.appendChild(detailDiv);
        
        const radioGroup = document.createElement("div");
        radioGroup.className = "radio-group";
        const radioValues = [5,4,3,2,1];
        const labels = {5:"Baik Sekali",4:"Baik",3:"Cukup",2:"Kurang",1:"Kurang Sekali"};
        
        radioValues.forEach(val => {
            const optionDiv = document.createElement("div");
            optionDiv.className = "radio-option";
            if (currentScores[i] === val) optionDiv.classList.add("selected");
            
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `aspek_${i}`;
            radio.value = val;
            radio.checked = (currentScores[i] === val);
            radio.addEventListener("change", () => {
                if (radio.checked) {
                    currentScores[i] = parseInt(radio.value);
                    updateAllUI();
                    const options = radioGroup.querySelectorAll('.radio-option');
                    options.forEach(opt => {
                        const r = opt.querySelector('input');
                        if (r && parseInt(r.value) === parseInt(radio.value)) {
                            opt.classList.add('selected');
                        } else {
                            opt.classList.remove('selected');
                        }
                    });
                    const cardEl = document.getElementById(`aspekCard_${i}`);
                    if (cardEl) {
                        cardEl.classList.remove('no-selected');
                        cardEl.classList.add('has-selected');
                    }
                    validateForm();
                }
            });
            
            const spanAngka = document.createElement("span");
            spanAngka.innerText = val;
            const smallLabel = document.createElement("div");
            smallLabel.className = "radio-label-text";
            smallLabel.innerText = labels[val];
            optionDiv.appendChild(radio);
            optionDiv.appendChild(spanAngka);
            optionDiv.appendChild(smallLabel);
            radioGroup.appendChild(optionDiv);
        });
        card.appendChild(radioGroup);
        
        const nilaiRow = document.createElement("div");
        nilaiRow.className = "nilai-bobot";
        const skorSpan = document.createElement("span");
        skorSpan.className = "nilai-skor empty";
        skorSpan.id = `skorValue_${i}`;
        skorSpan.innerHTML = `<i class="fas fa-circle" style="font-size:6px;color:#b0b8c0;margin-right:6px;"></i> Belum dipilih`;
        const ketSpan = document.createElement("span");
        ketSpan.className = "keterangan empty";
        ketSpan.id = `ketValue_${i}`;
        ketSpan.innerText = "☐ Belum dipilih";
        nilaiRow.appendChild(skorSpan);
        nilaiRow.appendChild(ketSpan);
        card.appendChild(nilaiRow);
        
        container.appendChild(card);
        aspekElements.push({ 
            card, 
            radioGroup, 
            skorSpan, 
            ketSpan, 
            radios: radioGroup.querySelectorAll('input') 
        });
    }
    updateAllUI();
}

function validateForm() {
    const requiredFields = document.querySelectorAll('.required-field input, .required-field select');
    let allValid = true;
    let allAspekSelected = true;
    
    requiredFields.forEach(field => {
        const parent = field.closest('.field');
        if (field.tagName === 'SELECT') {
            if (!field.value || field.value === '') {
                allValid = false;
                parent.classList.add('error');
            } else {
                parent.classList.remove('error');
            }
        } else {
            if (!field.value.trim()) {
                allValid = false;
                parent.classList.add('error');
            } else {
                parent.classList.remove('error');
            }
        }
    });
    
    for (let i = 0; i < currentScores.length; i++) {
        if (currentScores[i] === null || currentScores[i] === undefined) {
            allAspekSelected = false;
            break;
        }
    }
    
    const usulanSelect = document.getElementById('usulanSelect');
    const usulanBox = document.getElementById('usulanBox');
    if (!usulanSelect.value || usulanSelect.value === '') {
        allValid = false;
        usulanBox.classList.add('error');
    } else {
        usulanBox.classList.remove('error');
    }
    
    const isComplete = allValid && allAspekSelected;
    
    document.getElementById('shareWABtn').disabled = !isComplete;
    document.getElementById('printPDFbtn').disabled = !isComplete;
    
    return isComplete;
}

function updateAllUI() {
    let total = 0;
    let allSelected = true;
    
    for (let i = 0; i < aspekData.length; i++) {
        const skor = currentScores[i];
        const isSelected = (skor !== null && skor !== undefined);
        
        if (!isSelected) {
            allSelected = false;
            if (aspekElements[i]) {
                aspekElements[i].skorSpan.className = "nilai-skor empty";
                aspekElements[i].skorSpan.innerHTML = `<i class="fas fa-circle" style="font-size:6px;color:#b0b8c0;margin-right:6px;"></i> Belum dipilih`;
                aspekElements[i].ketSpan.className = "keterangan empty";
                aspekElements[i].ketSpan.innerText = "☐ Belum dipilih";
                const cardEl = document.getElementById(`aspekCard_${i}`);
                if (cardEl) {
                    cardEl.classList.remove('has-selected');
                    cardEl.classList.add('no-selected');
                }
            }
            continue;
        }
        
        const nilai = skor * 2;
        total += nilai;
        if (aspekElements[i]) {
            aspekElements[i].skorSpan.className = "nilai-skor";
            aspekElements[i].skorSpan.innerHTML = `${nilai} <span style="font-weight:400;font-size:11px;color:var(--text-light);">poin</span> <span style="font-weight:400;font-size:11px;color:var(--text-light);">(skor ${skor} x2)</span>`;
            aspekElements[i].ketSpan.className = "keterangan";
            aspekElements[i].ketSpan.innerText = getKeteranganByAspek(i, skor);
            const cardEl = document.getElementById(`aspekCard_${i}`);
            if (cardEl) {
                cardEl.classList.remove('no-selected');
                cardEl.classList.add('has-selected');
            }
        }
    }
    
    document.getElementById("totalNilaiDisplay").innerText = total;
    
    let kriteria = "";
    if (!allSelected) {
        kriteria = "Belum Lengkap";
    } else if (total >= 46) { 
        kriteria = "Sangat Baik"; 
    } else if (total >= 36) { 
        kriteria = "Baik"; 
    } else if (total >= 26) { 
        kriteria = "Cukup"; 
    } else if (total >= 16) { 
        kriteria = "Kurang"; 
    } else { 
        kriteria = "Kurang Sekali"; 
    }
    document.getElementById("kriteriaBadge").innerText = kriteria;
    
    const namaAtasan = document.getElementById("atasannya").value.trim();
    const jabatanAtasanSelect = document.getElementById("jabatanAtasan");
    let jabatanText = jabatanAtasanSelect.options[jabatanAtasanSelect.selectedIndex]?.text || "-";
    if (jabatanAtasanSelect.value === "") jabatanText = "-";
    document.getElementById("penilaiNamaSpan").innerText = namaAtasan || "(belum diisi)";
    document.getElementById("penilaiJabatanSpan").innerText = jabatanText;
    const tgl = document.getElementById("tglPenilaian").value;
    const formatted = tgl ? tgl.split('-').reverse().join('/') : "-";
    document.getElementById("tglPenilaianSpan").innerText = formatted;
}

function resetForm() {
    document.getElementById("namaKaryawan").value = "";
    document.getElementById("nik").value = "";
    document.getElementById("jabatan").selectedIndex = 0;
    document.getElementById("departemen").selectedIndex = 0;
    document.getElementById("statusKepegawaian").selectedIndex = 0;
    document.getElementById("atasannya").value = "";
    document.getElementById("jabatanAtasan").selectedIndex = 0;
    document.getElementById("tglPenilaian").value = new Date().toISOString().split('T')[0];
    document.getElementById("catatanPrestasi").value = "";
    document.getElementById("usulanSelect").selectedIndex = 0;
    
    document.querySelectorAll('.field').forEach(f => f.classList.remove('error'));
    document.getElementById('usulanBox').classList.remove('error');
    
    currentScores = [null, null, null, null, null];
    
    for (let i = 0; i < aspekElements.length; i++) {
        const radios = aspekElements[i].radios;
        radios.forEach(r => { r.checked = false; });
        const options = aspekElements[i].radioGroup.querySelectorAll('.radio-option');
        options.forEach(opt => opt.classList.remove('selected'));
        const cardEl = document.getElementById(`aspekCard_${i}`);
        if (cardEl) {
            cardEl.classList.remove('has-selected');
            cardEl.classList.add('no-selected');
        }
    }
    restoreIdentity();
    updateAllUI();
    validateForm();
    toast("⟳ Form telah direset");
}

// ===== GENERATE PDF =====
async function generatePDFBlob() {
    // jsPDF disuntikkan dari dependency lokal project.
    
    const namaKaryawan = document.getElementById('namaKaryawan').value.trim() || "Karyawan";
    const nik = document.getElementById('nik').value.trim() || "-";
    const jabatan = document.getElementById('jabatan').value || "-";
    const departemen = document.getElementById('departemen').value || "-";
    const statusKepegawaian = document.getElementById('statusKepegawaian').value || "-";
    const atasannya = document.getElementById('atasannya').value.trim() || "-";
    const jabatanAtasan = document.getElementById('jabatanAtasan').value || "-";
    let tglPenilaian = document.getElementById('tglPenilaian').value || new Date().toISOString().split('T')[0];
    const catatan = document.getElementById('catatanPrestasi').value || "";
    const usulan = document.getElementById('usulanSelect').value || "-";

    let totalNilai = 0;
    let allSelected = true;
    for (let i = 0; i < currentScores.length; i++) {
        if (currentScores[i] === null || currentScores[i] === undefined) {
            allSelected = false;
        } else {
            totalNilai += currentScores[i] * 2;
        }
    }

    let kriteria = "";
    if (!allSelected) {
        kriteria = "Belum Lengkap";
    } else if (totalNilai >= 46) { kriteria = "Sangat Baik"; }
    else if (totalNilai >= 36) { kriteria = "Baik"; }
    else if (totalNilai >= 26) { kriteria = "Cukup"; }
    else if (totalNilai >= 16) { kriteria = "Kurang"; }
    else { kriteria = "Kurang Sekali"; }

    const W = 85, margin = 5;
    const contentW = W - margin * 2;

    function calcHeight() {
        let h = 0;
        h += 28; // header
        h += 42; // identitas
        h += 7;  // judul aspek
        for (let i = 0; i < currentScores.length; i++) {
            const skor = currentScores[i];
            const ket = (skor !== null && skor !== undefined) ? getKeteranganByAspek(i, skor) : "Belum dipilih";
            const lines = ket.length > 35 ? 2 : 1;
            h += 13 + (lines - 1) * 3;
        }
        h += 18; // total
        h += 16; // usulan
        if (catatan) h += 16 + Math.ceil(catatan.length / 38) * 4;
        h += 34; // TTD 5 orang (tanpa (.............))
        h += 12; // footer
        return Math.max(h, 200);
    }

    const pageH = calcHeight();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, pageH] });
    let y = 0;

    // HEADER
    doc.setFillColor(13, 110, 253);
    doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`Approval PKWT (${namaKaryawan})`, margin, 9);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(232, 232, 232);
    doc.text('Kencana Print HR Department', margin, 16);
    doc.setFontSize(4.5); doc.setTextColor(200, 200, 200);
    doc.text(`Tanggal: ${tglPenilaian}`, margin, 22);
    y = 28;

    // IDENTITAS
    doc.setFillColor(248, 245, 240);
    doc.rect(0, y, W, 40, 'F');
    const identitas = [
        ['Nama', namaKaryawan], ['NIK', nik], ['Jabatan', jabatan],
        ['Unit', departemen], ['Status', statusKepegawaian],
        ['Penilai', atasannya + ' (' + jabatanAtasan + ')']
    ];
    identitas.forEach((item, idx) => {
        const yy = y + 4 + idx * 5.5;
        doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 90, 60);
        doc.text(item[0] + ':', margin + 2, yy);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 30, 20);
        let val = item[1].length > 20 ? item[1].substring(0, 18) + '..' : item[1];
        doc.text(val, margin + 28, yy);
    });
    y += 44;

    // ASPEK
    doc.setFillColor(13, 110, 253);
    doc.rect(0, y, W, 6, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
    doc.text('ASPEK PENILAIAN', margin, y + 4.5);
    y += 8;

    const aspekNamaPDF = ['Hasil Pekerjaan', 'Attitude', 'Kerjasama', 'Tanggung Jawab', 'Inisiatif'];
    for (let i = 0; i < aspekNamaPDF.length; i++) {
        const skor = currentScores[i];
        const isSelected = (skor !== null && skor !== undefined);
        const nilai = isSelected ? skor * 2 : 0;
        const ket = isSelected ? getKeteranganByAspek(i, skor) : '☐ Belum dipilih';
        const ketLines = doc.splitTextToSize(ket, 48);
        const rowH = 11 + (ketLines.length - 1) * 3;
        if (i % 2 === 0) { doc.setFillColor(250, 248, 245); doc.rect(0, y, W, rowH, 'F'); }
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 30, 20);
        doc.text(`${i+1}. ${aspekNamaPDF[i]}`, margin + 1, y + 4);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(isSelected ? 13 : 180, isSelected ? 110 : 180, isSelected ? 253 : 180);
        doc.text(isSelected ? `${nilai}` : '-', margin + 62, y + 4);
        doc.setFontSize(4.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(isSelected ? 100 : 170, isSelected ? 80 : 170, isSelected ? 60 : 170);
        doc.text(ketLines, margin + 1, y + 8);
        y += rowH;
    }

    // TOTAL
    y += 1;
    doc.setFillColor(13, 110, 253);
    doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('TOTAL NILAI', margin + 3, y + 6);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(allSelected ? `${totalNilai} / 50` : 'Belum Lengkap', margin + contentW - 3, y + 10, { align: 'right' });
    y += 18;

    // KRITERIA & USULAN
    doc.setFillColor(255, 248, 235);
    doc.rect(margin, y, contentW, 14, 'F');
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(140, 100, 30);
    doc.text(`Kriteria: ${kriteria}`, margin + 2, y + 5);
    doc.text(`Usulan : ${usulan}`, margin + 2, y + 10);
    y += 18;

    // CATATAN
    if (catatan) {
        doc.setFillColor(248, 245, 240);
        doc.rect(margin, y, contentW, 14, 'F');
        doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(74, 46, 14);
        doc.text('Catatan:', margin + 2, y + 4);
        doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(46, 26, 8);
        const noteLines = doc.splitTextToSize(catatan, contentW - 4);
        doc.text(noteLines, margin + 2, y + 9);
        y += 16;
    }

    // TTD LENGKAP (tanpa (.............) dan tanpa tanggal di bawah)
    doc.setFillColor(248, 245, 240);
    doc.rect(margin, y, contentW, 32, 'F');
    doc.setDrawColor(13, 110, 253);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentW, 32);
    
    doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 110, 253);
    doc.text('PERSETUJUAN', margin + contentW / 2, y + 4, { align: 'center' });
    
    const ttdData = [
        { label: 'Karyawan Ybs', x: margin + 2 },
        { label: 'Atasan Langsung', x: margin + 18 },
        { label: 'Supervisor', x: margin + 34 },
        { label: 'Manager', x: margin + 50 },
        { label: 'HRD', x: margin + 66 }
    ];
    
    ttdData.forEach((item) => {
        doc.setDrawColor(120, 90, 60);
        doc.setLineWidth(0.2);
        doc.line(item.x, y + 16, item.x + 13, y + 16);
        doc.setFontSize(4); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 90, 60);
        doc.text(item.label, item.x, y + 20);
        // Kosongkan area (.............) - dihapus
    });
    
    // Tanggal di bawah - dihapus
    y += 36;

    // FOOTER
    doc.setDrawColor(200, 180, 160);
    doc.setLineWidth(0.1);
    doc.line(margin, y, W - margin, y);
    y += 3;
    doc.setFontSize(4); doc.setFont('helvetica', 'normal'); doc.setTextColor(140, 120, 100);
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, margin, y);
    y += 3;
    doc.text('Kencana Print HR - Performance Appraisal', margin, y);

    return doc.output('blob');
}

// ===== MODAL HANDLER =====
function showWarningModal() {
    if (!validateForm()) return;
    const modal = document.getElementById('warningModal');
    const checkbox = document.getElementById('agreeCheck');
    const confirmBtn = document.getElementById('confirmModal');
    const cancelBtn = document.getElementById('cancelModal');
    const checkboxGroup = document.getElementById('checkboxGroup');
    
    // Reset state
    checkbox.checked = false;
    confirmBtn.disabled = true;
    checkboxGroup.classList.remove('error');
    modal.classList.add('show');
    
    // Checkbox listener
    checkbox.onchange = function() {
        if (this.checked) {
            confirmBtn.disabled = false;
            checkboxGroup.classList.remove('error');
        } else {
            confirmBtn.disabled = true;
        }
    };
    
    // Cancel
    cancelBtn.onclick = function() {
        modal.classList.remove('show');
    };
    
    // Confirm
    confirmBtn.onclick = function() {
        if (!checkbox.checked) {
            checkboxGroup.classList.add('error');
            return;
        }
        modal.classList.remove('show');
        // Lanjutkan kirim PDF
        executeSharePDF();
    };
    
    // Click outside to close
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    };
}

// ===== EXECUTE SHARE PDF =====
async function executeSharePDF() {
    if (isProcessing) return;
    isProcessing = true;
    
    const overlay = document.getElementById('overlay');
    overlay.classList.add('show');
    
    try {
        const pdfBlob = await generatePDFBlob();
        const namaKaryawan = document.getElementById('namaKaryawan').value.trim() || "Karyawan";
        const tglPenilaian = document.getElementById('tglPenilaian').value || new Date().toISOString().split('T')[0];
        const filename = `Approval_PKWT_${namaKaryawan.replace(/\s/g, '_')}_${tglPenilaian.replace(/-/g, '')}.pdf`;
        
        // Buat pesan WA
        const nik = document.getElementById('nik').value.trim() || "-";
        const jabatan = document.getElementById('jabatan').value || "-";
        const departemen = document.getElementById('departemen').value || "-";
        const statusKepegawaian = document.getElementById('statusKepegawaian').value || "-";
        const atasannya = document.getElementById('atasannya').value.trim() || "-";
        const jabatanAtasan = document.getElementById('jabatanAtasan').value || "-";
        const usulan = document.getElementById('usulanSelect').value || "-";
        const catatan = document.getElementById('catatanPrestasi').value || "";
        
        let totalNilai = 0;
        let allSelected = true;
        for (let i = 0; i < currentScores.length; i++) {
            if (currentScores[i] === null || currentScores[i] === undefined) {
                allSelected = false;
            } else {
                totalNilai += currentScores[i] * 2;
            }
        }
        let kriteria = "";
        if (!allSelected) kriteria = "Belum Lengkap";
        else if (totalNilai >= 46) kriteria = "Sangat Baik";
        else if (totalNilai >= 36) kriteria = "Baik";
        else if (totalNilai >= 26) kriteria = "Cukup";
        else if (totalNilai >= 16) kriteria = "Kurang";
        else kriteria = "Kurang Sekali";
        
        const aspekNama = ['Hasil Pekerjaan', 'Attitude pada Perusahaan', 'Kerjasama', 'Tanggung Jawab', 'Inisiatif'];
        let waMessage = `📋 PENILAIAN PRESTASI KERJA 📋\n`;
        waMessage += `👥 Karyawan Tanpa Bawahan\n`;
        waMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waMessage += `👤 Nama       : ${namaKaryawan}\n`;
        waMessage += `🆔 NIK        : ${nik}\n`;
        waMessage += `📌 Jabatan    : ${jabatan}\n`;
        waMessage += `🏢 Unit       : ${departemen}\n`;
        waMessage += `📋 Status     : ${statusKepegawaian}\n`;
        waMessage += `👨‍💼 Penilai    : ${atasannya} (${jabatanAtasan})\n`;
        waMessage += `📅 Tanggal    : ${tglPenilaian.split('-').reverse().join('/')}\n`;
        waMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waMessage += `⭐ HASIL PENILAIAN ⭐\n`;
        for (let i = 0; i < aspekNama.length; i++) {
            const skor = currentScores[i];
            const isSelected = (skor !== null && skor !== undefined);
            const nilai = isSelected ? skor * 2 : 0;
            let statusText = "";
            let icon = "";
            if (!isSelected) { statusText = "Belum dipilih"; icon = "⬜"; }
            else if (skor === 5) { statusText = "Baik Sekali"; icon = "🔥"; }
            else if (skor === 4) { statusText = "Baik"; icon = "✅"; }
            else if (skor === 3) { statusText = "Cukup"; icon = "📌"; }
            else if (skor === 2) { statusText = "Kurang"; icon = "⚠️"; }
            else { statusText = "Kurang Sekali"; icon = "❌"; }
            waMessage += `   ${i+1}. ${aspekNama[i]} : ${isSelected ? nilai + ' poin' : '-'} ${icon} (skor ${isSelected ? skor : '-'} - ${statusText})\n`;
        }
        waMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waMessage += `✅ TOTAL NILAI: ${allSelected ? totalNilai + ' / 50' : 'Belum Lengkap'} (${kriteria})\n`;
        waMessage += `📌 USULAN    : ${usulan}\n`;
        if (catatan) waMessage += `📝 CATATAN: ${catatan}\n`;
        waMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waMessage += `📊 POLLING PERSETUJUAN\n`;
        waMessage += `Silakan berikan keputusan:\n`;
        waMessage += `✅ ACC / SETUJU (balas: ACC)\n`;
        waMessage += `❌ TIDAK ACC / TOLAK (balas: TIDAK ACC)\n`;
        waMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        waMessage += `🏢 HR - Performance Appraisal System`;
        
        overlay.classList.remove('show');
        
        await deliverResult({ pdfBlob, filename, text: waMessage });
        
    } catch (err) {
        console.error(err);
        overlay.classList.remove('show');
        toast('❌ Gagal membuat PDF');
    }
    
    isProcessing = false;
}

// ===== SAVE CETAK (PDF) =====
async function generateAndSavePDF() {
    if (!validateForm()) return;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('show');
    
    try {
        const pdfBlob = await generatePDFBlob();
        const namaKaryawan = document.getElementById('namaKaryawan').value.trim() || "Karyawan";
        const tglPenilaian = document.getElementById('tglPenilaian').value || new Date().toISOString().split('T')[0];
        const filename = `Approval_PKWT_${namaKaryawan.replace(/\s/g, '_')}_${tglPenilaian.replace(/-/g, '')}.pdf`;
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast('📄 PDF siap diunduh. Selesaikan penyimpanan melalui browser.');
    } catch (err) {
        console.error(err);
        toast('❌ Gagal membuat PDF');
    }
    
    overlay.classList.remove('show');
}

// ===== EVENT LISTENERS =====
document.getElementById("resetFormBtn").addEventListener("click", resetForm);
document.getElementById("printPDFbtn").addEventListener("click", generateAndSavePDF);

// Tombol Kirim WA -> tampilkan modal dulu
document.getElementById("shareWABtn").addEventListener("click", showWarningModal);

const dynamicInputs = ["namaKaryawan", "nik", "jabatan", "departemen", "statusKepegawaian", "atasannya", "jabatanAtasan", "tglPenilaian", "usulanSelect"];
dynamicInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => {
        updateAllUI();
        validateForm();
    });
    if (el && el.tagName === "SELECT") el.addEventListener("change", () => {
        updateAllUI();
        validateForm();
    });
});

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
document.getElementById('tglPenilaian').value = todayStr;

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const dateStr = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
document.getElementById('greetingDate').innerText = dateStr;

buildAspekUI();
updateAllUI();
validateForm();

return { generatePDFBlob, validateForm, resetForm, executeSharePDF, getKeteranganByAspek, getScores: () => [...currentScores], getAspek: () => aspekData };
}
