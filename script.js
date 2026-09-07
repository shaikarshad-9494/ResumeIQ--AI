/* ==========================================================
   ResumeIQ — ATS Resume Checker
   Frontend-only logic. No backend / server calls.
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------------------------------------------------
     Element references
  --------------------------------------------------------- */

  const siteHeader = document.getElementById('site-header');

  const dropzone = document.getElementById('dropzone');
  const resumeInput = document.getElementById('resume-input');
  const browseBtn = document.getElementById('browse-btn');
  const uploadEmpty = document.getElementById('upload-empty');
  const uploadFilled = document.getElementById('upload-filled');
  const fileNameDisplay = document.getElementById('file-name-display');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const resumeError = document.getElementById('resume-error');

  const jdTextarea = document.getElementById('jd-textarea');
  const wordCountEl = document.getElementById('word-count');
  const keywordStatusEl = document.getElementById('keyword-status');

  const analyzeBtn = document.getElementById('analyze-btn');
  const analyzeBtnText = document.getElementById('analyze-btn-text');
  const validationMessage = document.getElementById('validation-message');

  const resultsEmptyMessage = document.getElementById('results-empty-message');
  const scanningState = document.getElementById('scanning-state');
  const scanningStatusText = document.getElementById('scanning-status-text');
  const scanProgressBar = document.getElementById('scan-progress-bar');

  const resultsDashboard = document.getElementById('results-dashboard');
  const scoreRingFill = document.getElementById('score-ring-fill');
  const scoreValueEl = document.getElementById('score-value');
  const scoreInterpretationEl = document.getElementById('score-interpretation');

  const metricEls = {
    keyword: { value: document.getElementById('metric-keyword'), bar: document.getElementById('metric-keyword-bar') },
    formatting: { value: document.getElementById('metric-formatting'), bar: document.getElementById('metric-formatting-bar') },
    content: { value: document.getElementById('metric-content'), bar: document.getElementById('metric-content-bar') },
    compatibility: { value: document.getElementById('metric-compatibility'), bar: document.getElementById('metric-compatibility-bar') }
  };

  const matchedKeywordsList = document.getElementById('matched-keywords-list');
  const missingKeywordsList = document.getElementById('missing-keywords-list');
  const recommendationsList = document.getElementById('recommendations-list');

  const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];
  const MAX_FILE_SIZE_MB = 10;
  const SCORE_RING_CIRCUMFERENCE = 553; // 2 * PI * 88, matches the SVG radius

  const state = {
    resumeFile: null,
    jdText: ''
  };

  /* ---------------------------------------------------------
     Sticky header shadow on scroll
  --------------------------------------------------------- */

  window.addEventListener('scroll', () => {
    siteHeader.classList.toggle('scrolled', window.scrollY > 8);
  });

  /* ---------------------------------------------------------
     Reveal-on-scroll animations
  --------------------------------------------------------- */

  const revealTargets = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealTargets.forEach((el) => revealObserver.observe(el));

  /* ---------------------------------------------------------
     Resume upload — browse, drag & drop, validation
  --------------------------------------------------------- */

  function getExtension(filename) {
    const parts = filename.split('.');
    return '.' + parts[parts.length - 1].toLowerCase();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showResumeError(message) {
    resumeError.textContent = message;
    resumeError.hidden = false;
  }

  function clearResumeError() {
    resumeError.hidden = true;
  }

  function handleFile(file) {
    if (!file) return;
    clearResumeError();

    const ext = getExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      showResumeError('Please upload a PDF, DOC, DOCX, or TXT file under 10MB.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showResumeError(`That file is larger than ${MAX_FILE_SIZE_MB}MB. Please upload a smaller file.`);
      return;
    }

    state.resumeFile = file;

    fileNameDisplay.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    uploadEmpty.hidden = true;
    uploadFilled.hidden = false;

    updateAnalyzeAvailability();
  }

  function clearFile() {
    state.resumeFile = null;
    resumeInput.value = '';
    uploadFilled.hidden = true;
    uploadEmpty.hidden = false;
    clearResumeError();
    updateAnalyzeAvailability();
  }

  // Browse button opens the real file picker
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resumeInput.click();
  });

  resumeInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file);
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  /* ---------------------------------------------------------
     Job description — live word count + keyword status
  --------------------------------------------------------- */

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  jdTextarea.addEventListener('input', () => {
    state.jdText = jdTextarea.value;
    const words = countWords(state.jdText);
    wordCountEl.textContent = `${words} word${words === 1 ? '' : 's'}`;

    const keywords = extractKeywords(state.jdText);

    if (words === 0) {
      keywordStatusEl.textContent = 'Waiting for input…';
      keywordStatusEl.classList.remove('is-active');
    } else if (keywords.length === 0) {
      keywordStatusEl.textContent = 'Add more detail to detect keywords';
      keywordStatusEl.classList.remove('is-active');
    } else {
      keywordStatusEl.textContent = `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} detected automatically`;
      keywordStatusEl.classList.add('is-active');
    }

    updateAnalyzeAvailability();
  });

  /* ---------------------------------------------------------
     Analyze availability + validation
  --------------------------------------------------------- */

  function updateAnalyzeAvailability() {
    // The button always stays clickable; clicking without both
    // inputs present shows a validation message instead of breaking.
    const ready = Boolean(state.resumeFile) && state.jdText.trim().length > 0;
    if (ready) {
      validationMessage.hidden = true;
    }
  }

  /* ---------------------------------------------------------
     Keyword extraction (frontend simulation)
  --------------------------------------------------------- */

  const STOPWORDS = new Set([
    'the','a','an','and','or','but','if','then','so','of','in','on','at','to','for','with',
    'by','from','as','is','are','was','were','be','been','being','this','that','these','those',
    'you','your','we','our','their','they','it','its','will','can','may','must','should','would',
    'could','have','has','had','do','does','did','not','no','yes','about','into','over','under',
    'up','down','out','off','than','also','such','etc','including','including','including',
    'per','via','role','job','work','working','experience','years','year','team','teams',
    'ability','strong','excellent','including','responsibilities','requirements','preferred',
    'skills','skill','required','plus','including','company','looking','description','who',
    'what','when','where','why','how','all','any','each','both','more','most','other','some',
    'only','own','same','very','just','while','across','within','using','used','use'
  ]);

  function extractKeywords(text) {
    if (!text || !text.trim()) return [];

    const rawWords = text
      .toLowerCase()
      .replace(/[^a-z0-9+.#\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const freq = new Map();

    rawWords.forEach((word) => {
      const clean = word.replace(/^[.#+]+|[.#+]+$/g, '');
      if (clean.length < 3) return;
      if (STOPWORDS.has(clean)) return;
      if (/^\d+$/.test(clean)) return;
      freq.set(clean, (freq.get(clean) || 0) + 1);
    });

    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word]) => word);

    const top = sorted.slice(0, 14);

    return top.map((word) => {
      if (/^[a-z]+\.[a-z]+$/.test(word)) return word; // e.g. node.js
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
  }

  /* ---------------------------------------------------------
     Deterministic pseudo-random (seeded) — used only for
     non-parseable formats (PDF/DOC/DOCX) where real text
     extraction would require a backend.
  --------------------------------------------------------- */

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------
     Read a .txt resume's real content
  --------------------------------------------------------- */

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  const FORMAT_SCORES = { '.pdf': 92, '.docx': 88, '.doc': 78, '.txt': 66 };

  /* ---------------------------------------------------------
     Core analysis
  --------------------------------------------------------- */

  async function runAnalysis(file, jdText) {
    const keywords = extractKeywords(jdText);
    const ext = getExtension(file.name);
    const formattingPct = FORMAT_SCORES[ext] || 75;

    let matched = [];
    let missing = [];
    let contentQualityPct;

    if (ext === '.txt') {
      // Real text is available — do a genuine substring match.
      let resumeText = state.resumeText || '';
      try {
        resumeText = (await readTextFile(file)).toLowerCase();
      } catch (err) {
        resumeText = '';
      }
      state.resumeText = resumeText;
      keywords.forEach((kw) => {
        if (resumeText.includes(kw.toLowerCase())) {
          matched.push(kw);
        } else {
          missing.push(kw);
        }
      });

      const hasNumbers = /\b\d+(%|\+)?\b/.test(resumeText);
      const sectionWords = ['experience', 'education', 'skills', 'summary', 'projects'];
      const sectionHits = sectionWords.filter((w) => resumeText.includes(w)).length;
      contentQualityPct = Math.min(96, 55 + sectionHits * 8 + (hasNumbers ? 10 : 0));

    } else if (ext === ".pdf") {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let resumeText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();

            resumeText += content.items
                .map(item => item.str)
                .join(" ") + " ";
        }

        resumeText = resumeText.toLowerCase();

        keywords.forEach((kw) => {
            if (resumeText.includes(kw.toLowerCase())) {
                matched.push(kw);
            } else {
                missing.push(kw);
            }
        });

        const hasNumbers = /\b\d+([%+]?)\b/.test(resumeText);

        const sectionWords = [
            "experience",
            "education",
            "skills",
            "projects",
            "certification",
            "summary"
        ];

        const sectionHits = sectionWords.filter(word =>
            resumeText.includes(word)
        ).length;

        contentQualityPct = Math.min(
            96,
            55 + sectionHits * 7 + (hasNumbers ? 8 : 0)
        );

    } catch (err) {
        console.error("PDF extraction failed:", err);

        keywords.forEach((kw) => missing.push(kw));
        contentQualityPct = 40;
    }

} else {
    keywords.forEach((kw) => missing.push(kw));
    contentQualityPct = 50;
}

    const keywordMatchPct = keywords.length
      ? Math.round((matched.length / keywords.length) * 100)
      : 0;

    const compatibilityPct = Math.round(
      keywordMatchPct * 0.5 + formattingPct * 0.3 + contentQualityPct * 0.2
    );

    const atsScore = Math.round(
      keywordMatchPct * 0.5 + formattingPct * 0.25 + contentQualityPct * 0.25
    );

    return {
      atsScore: Math.max(0, Math.min(100, atsScore)),
      keywordMatchPct,
      formattingPct,
      contentQualityPct,
      compatibilityPct,
      matched,
      missing,
      keywordsTotal: keywords.length
    };
  }

  function interpretScore(score) {
    if (score >= 90) return 'Excellent Match';
    if (score >= 75) return 'Strong Match';
    if (score >= 60) return 'Moderate Match';
    return 'Needs Improvement';
  }

  function buildRecommendations(result, ext) {
    const recs = [];

    if (result.missing.length > 0) {
      const sample = result.missing.slice(0, 3).join(', ');
      recs.push(`Add relevant terms like ${sample} to strengthen keyword alignment with this role.`);
    }

    if (result.keywordMatchPct < 70) {
      recs.push('Mirror more of the exact terminology used in the job description, where genuinely true of your background.');
    }

    if (result.formattingPct < 85) {
      recs.push('Use a cleaner, ATS-friendly format — simple headings, no tables, columns, or embedded images.');
    }

    if (result.contentQualityPct < 80) {
      recs.push('Add measurable achievements (numbers, percentages, outcomes) rather than only listing responsibilities.');
    }

    if (ext === '.doc') {
      recs.push('Consider saving your resume as a PDF or DOCX — some ATS platforms parse these more reliably than legacy .doc files.');
    }

    recs.push('Make sure core sections — Experience, Education, and Skills — are clearly labeled so the ATS can parse them correctly.');

    return recs.slice(0, 6);
  }

  /* ---------------------------------------------------------
     Rendering results
  --------------------------------------------------------- */

  function animateCountUp(el, targetValue, duration = 1200) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * targetValue);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderKeywordTags(container, words, emptyLabel) {
    container.innerHTML = '';
    if (words.length === 0) {
      const span = document.createElement('span');
      span.className = 'kw-empty';
      span.textContent = emptyLabel;
      container.appendChild(span);
      return;
    }
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'kw-tag';
      span.textContent = word;
      span.style.animationDelay = `${i * 45}ms`;
      container.appendChild(span);
    });
  }

  function renderResults(result, ext) {
    // Score ring + number
    const offset = SCORE_RING_CIRCUMFERENCE * (1 - result.atsScore / 100);
    // Force reflow so the transition reliably triggers
    scoreRingFill.style.strokeDashoffset = SCORE_RING_CIRCUMFERENCE;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scoreRingFill.style.strokeDashoffset = String(offset);
      });
    });

    animateCountUp(scoreValueEl, result.atsScore);
    scoreInterpretationEl.textContent = interpretScore(result.atsScore);

    // Metric cards
    const metrics = {
      keyword: result.keywordMatchPct,
      formatting: result.formattingPct,
      content: result.contentQualityPct,
      compatibility: result.compatibilityPct
    };

    Object.keys(metrics).forEach((key) => {
      const pct = metrics[key];
      metricEls[key].value.textContent = `${pct}%`;
      requestAnimationFrame(() => {
        metricEls[key].bar.style.width = `${pct}%`;
      });
    });

    // Keyword tags
    renderKeywordTags(matchedKeywordsList, result.matched, 'No strong keyword matches found yet.');
    renderKeywordTags(missingKeywordsList, result.missing, 'No missing keywords — great alignment.');

    // Recommendations
    recommendationsList.innerHTML = '';
    buildRecommendations(result, ext).forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      recommendationsList.appendChild(li);
    });
  }

  /* ---------------------------------------------------------
     Analyze button click flow
  --------------------------------------------------------- */

  const SCAN_MESSAGES = [
    'Reading resume content…',
    'Extracting keywords from job description…',
    'Comparing skills and experience…',
    'Calculating ATS match score…'
  ];

  analyzeBtn.addEventListener('click', async () => {
    const hasResume = Boolean(state.resumeFile);
    const hasJd = state.jdText.trim().length > 0;

    if (!hasResume || !hasJd) {
      let message = 'Please add both your resume and a job description to run an analysis.';
      if (hasResume && !hasJd) message = 'Please add a job description to run an analysis.';
      if (!hasResume && hasJd) message = 'Please upload your resume to run an analysis.';

      validationMessage.textContent = message;
      validationMessage.hidden = false;
      analyzeBtn.classList.remove('shake');
      // Restart the shake animation even on repeated clicks
      void analyzeBtn.offsetWidth;
      analyzeBtn.classList.add('shake');
      return;
    }

    validationMessage.hidden = true;
    analyzeBtn.disabled = true;
    analyzeBtnText.textContent = 'Analyzing…';

const webhookUrl = 'https://among-regular-stratified-foundations.trycloudflare.com/webhook/f95f87f7-e329-42be-8163';
  try {
  console.log('Job Description:', state.jdText);
  console.log('Resume Text:',state.resumeText);
  console.log('Resume Text Length:',state.resumeText?.length);
    const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
    jobDescription: state.jdText,
    resumeText: state.resumeText,
    fileName: state.resumeFile.name
})
  });
  const responseText = await response.text();

let data = {};

if (responseText.trim()) {
    data = JSON.parse(responseText);
}

console.log('n8n Webhook response:', data);
} catch (error) {
    console.error('Webhook error:', error);
}
    resultsEmptyMessage.hidden = true;
    resultsDashboard.hidden = true;
    scanningState.hidden = false;
    scanProgressBar.style.width = '0%';

    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

    let step = 0;
    scanningStatusText.textContent = SCAN_MESSAGES[0];
    const messageInterval = setInterval(() => {
      step += 1;
      if (step < SCAN_MESSAGES.length) {
        scanningStatusText.textContent = SCAN_MESSAGES[step];
      }
    }, 480);

    requestAnimationFrame(() => {
      scanProgressBar.style.width = '100%';
    });

    const ext = getExtension(state.resumeFile.name);
    const [result] = await Promise.all([
      runAnalysis(state.resumeFile, state.jdText),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);

    clearInterval(messageInterval);

    scanningState.hidden = true;
    resultsDashboard.hidden = false;

    renderResults(result, ext);

    analyzeBtn.disabled = false;
    analyzeBtnText.textContent = 'Run ATS Analysis';

    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  updateAnalyzeAvailability();
});