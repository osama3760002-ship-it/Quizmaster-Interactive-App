
import Question from './question.js';

const API_BASE_URL = 'https://opentdb.com/api.php';
const LEADERBOARD_KEY = 'quizMasterLeaderboard';

export default class Quiz {
  constructor(settings, container, callbacks = {}) {
    this.playerName = String(settings.playerName || '').trim() || 'Player';
    this.category = settings.category ?? '';
    this.difficulty = settings.difficulty ?? '';
    this.amount = Number(settings.amount) || 10;
    this.container = container;
    this.callbacks = callbacks;

    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.correctAnswers = 0;
    this.questionView = null;
    this.destroyed = false;
    this.startedAt = null;
    this.isLoading = false;
  }

  wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }



buildParams(settings) {
  const params = new URLSearchParams();

  const amount = Math.min(
    50,
    Math.max(1, Number(settings?.amount) || 10)
  );

  params.set('amount', String(amount));
  params.set('type', 'multiple');

  const categoryText = String(settings?.category ?? '').trim();
  const categoryNumber = Number(categoryText);

  if (
    categoryText &&
    categoryText.toLowerCase() !== 'any' &&
    Number.isInteger(categoryNumber) &&
    categoryNumber >= 9 &&
    categoryNumber <= 32
  ) {
    params.set('category', String(categoryNumber));
  }

  const difficulty = String(settings?.difficulty ?? '')
    .trim()
    .toLowerCase();

  if (['easy', 'medium', 'hard'].includes(difficulty)) {
    params.set('difficulty', difficulty);
  }

  return params;
}



 

async requestQuestions(settings) {
  const params = this.buildParams(settings);

  // OpenTDB doesn't need encode=default, so remove it.
  params.delete('encode');

  const url = `${API_BASE_URL}?${params.toString()}`;

  console.info('[QuizMaster] Request URL:', url);

  let response;

  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    console.error('[QuizMaster] Fetch error:', error);
    throw new Error(
      'Could not connect to the questions service. Check your internet connection and try again.'
    );
  }

  if (response.status === 429) {
    throw new Error(
      'Too many requests. Please wait 30–60 seconds before trying again.'
    );
  }

  if (!response.ok) {
    throw new Error(
      `The questions service returned HTTP ${response.status}. Please try again later.`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    console.error('[QuizMaster] Invalid JSON response:', error);
    throw new Error('The questions service returned an invalid response.');
  }

  console.info('[QuizMaster] Response code:', data.response_code);
  console.info(
    '[QuizMaster] Questions received:',
    Array.isArray(data.results) ? data.results.length : 'invalid results'
  );

  if (data.response_code !== 0) {
    console.error('[QuizMaster] API error response:', data);
  }

  return data;
}



  async getQuestions() {
    const requestedAmount = Math.min(
      50,
      Math.max(1, Number(this.amount) || 10)
    );

    const categoryText = String(this.category ?? '').trim();
    const categoryNumber = Number(categoryText);

    const category =
      categoryText &&
      categoryText.toLowerCase() !== 'any' &&
      Number.isInteger(categoryNumber) &&
      categoryNumber >= 9 &&
      categoryNumber <= 32
        ? categoryNumber
        : null;

    const difficultyText = String(this.difficulty ?? '')
      .trim()
      .toLowerCase();

    const difficulty = ['easy', 'medium', 'hard'].includes(difficultyText)
      ? difficultyText
      : null;

    // Try the selected settings first, then progressively relax filters.
    const attempts = [];
    const addAttempt = (amount, cat, diff) => {
      const key = `${amount}|${cat ?? ''}|${diff ?? ''}`;

      if (!attempts.some(item => item.key === key)) {
        attempts.push({
          key,
          amount,
          category: cat,
          difficulty: diff
        });
      }
    };

    addAttempt(requestedAmount, category, difficulty);

    if (difficulty) {
      addAttempt(Math.min(requestedAmount, 10), category, null);
    }

    if (category) {
      addAttempt(Math.min(requestedAmount, 10), null, difficulty);
    }

    addAttempt(Math.min(requestedAmount, 10), null, null);

    let lastResponseCode = null;
    let lastError = null;

    for (let i = 0; i < attempts.length; i++) {
      if (this.destroyed) return [];

      // Space requests apart to reduce the chance of HTTP 429.
      if (i > 0) {
        await this.wait(5200);
      }

      const attempt = attempts[i];

      let data;

      try {
        data = await this.requestQuestions(attempt);
      } catch (error) {
        lastError = error;

        // Network errors and rate limits should not trigger more requests.
        throw error;
      }

      lastResponseCode = data.response_code;

      if (
        data.response_code === 0 &&
        Array.isArray(data.results) &&
        data.results.length > 0
      ) {
        if (i > 0) {
          console.warn(
            '[QuizMaster] Questions loaded using fallback settings.'
          );
        }

        return data.results;
      }

      // OpenTDB response codes 1, 2 and 4 can be retried with broader settings.
      if (![1, 2, 4].includes(data.response_code)) {
        break;
      }
    }

    if (lastError) {
      throw lastError;
    }

    const messages = {
      1: 'Not enough questions are available for these settings. Try another category or difficulty.',
      2: 'The API rejected the request settings. Please check the category and difficulty.',
      3: 'The questions service could not find a session. Please try again.',
      4: 'The questions database needs to be refreshed. Please try again later.'
    };

    throw new Error(
      messages[lastResponseCode] ||
      'The questions service returned no questions. Please try again.'
    );
  }

  async start() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.destroyed = false;
    this.startedAt = Date.now();

    if (this.callbacks.onLoading) {
      this.callbacks.onLoading('Loading Questions...');
    }

    try {
      const questions = await this.getQuestions();

      if (this.destroyed) return;

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('No questions were returned. Please try again.');
      }

      this.questions = questions;
      this.amount = questions.length;
      this.currentIndex = 0;
      this.score = 0;
      this.correctAnswers = 0;

      if (this.callbacks.onLoaded) {
        this.callbacks.onLoaded();
      }

      this.showQuestion();
    } catch (error) {
      console.error('[QuizMaster] Failed to start quiz:', error);

      if (this.callbacks.onError) {
        this.callbacks.onError(error.message, () => {
          this.start();
        });
      }
    } finally {
      this.isLoading = false;
    }
  }

  showQuestion() {
    if (this.destroyed) return;

    if (this.currentIndex >= this.questions.length) {
      this.showResults();
      return;
    }

    if (this.questionView) {
      this.questionView.destroy();
    }

    this.questionView = new Question({
      questionData: this.questions[this.currentIndex],
      index: this.currentIndex,
      total: this.questions.length,
      score: this.score,
      container: this.container,

      onAnswer: isCorrect => {
        if (isCorrect) {
          this.correctAnswers += 1;
          this.score += 1;
        }
      },

      onNext: () => {
        this.currentIndex += 1;
        this.showQuestion();
      },

      onScoreChange: score => {
        this.score = score;
      }
    });

    this.questionView.render();
  }

  getLeaderboard() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(LEADERBOARD_KEY) || '[]'
      );

      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  saveResult(percentage) {
    const leaderboard = this.getLeaderboard();

    const entry = {
      name: this.playerName || 'Player',
      score: this.correctAnswers,
      total: this.questions.length,
      percentage,
      date: new Date().toISOString()
    };

    leaderboard.push(entry);

    leaderboard.sort((a, b) =>
      b.percentage - a.percentage ||
      b.score - a.score ||
      new Date(b.date) - new Date(a.date)
    );

    const topEntries = leaderboard.slice(0, 10);

    try {
      localStorage.setItem(
        LEADERBOARD_KEY,
        JSON.stringify(topEntries)
      );
    } catch (error) {
      console.warn('[QuizMaster] Could not save leaderboard:', error);
    }

    return {
      entry,
      leaderboard: topEntries,
      isNewRecord: topEntries[0] === entry
    };
  }

  showResults() {
    if (this.questionView) {
      this.questionView.destroy();
      this.questionView = null;
    }

    const total = this.questions.length || this.amount;
    const percentage = total
      ? Math.round((this.correctAnswers / total) * 100)
      : 0;

    const { leaderboard, isNewRecord } = this.saveResult(percentage);

    const card = document.createElement('section');
    card.className = 'game-card results-card';

    const heading = document.createElement('h2');
    heading.className = 'results-title';
    heading.textContent = 'Quiz Complete!';

    const scoreDisplay = document.createElement('p');
    scoreDisplay.className = 'results-score-display';
    scoreDisplay.textContent = `${this.correctAnswers}/${total}`;

    const percentageDisplay = document.createElement('p');
    percentageDisplay.className = 'results-percentage';
    percentageDisplay.textContent = `${percentage}% Accuracy`;

    card.append(heading, scoreDisplay, percentageDisplay);

    if (isNewRecord) {
      const badge = document.createElement('div');
      badge.className = 'new-record-badge';
      badge.innerHTML =
        '<i class="fa-solid fa-star" aria-hidden="true"></i> New High Score!';
      card.appendChild(badge);
    }

    const leaderboardSection = document.createElement('section');
    leaderboardSection.className = 'leaderboard';
    leaderboardSection.innerHTML =
      '<h4 class="leaderboard-title"><i class="fa-solid fa-trophy" aria-hidden="true"></i> Leaderboard</h4>';

    const list = document.createElement('ul');
    list.className = 'leaderboard-list';

    leaderboard.forEach((entry, index) => {
      const item = document.createElement('li');

      const medalClass =
        index === 0 ? ' gold' :
        index === 1 ? ' silver' :
        index === 2 ? ' bronze' : '';

      item.className = `leaderboard-item${medalClass}`;

      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = `#${index + 1}`;

      const name = document.createElement('span');
      name.className = 'leaderboard-name';
      name.textContent = entry.name || 'Player';

      const score = document.createElement('span');
      score.className = 'leaderboard-score';
      score.textContent = `${entry.percentage}%`;

      item.append(rank, name, score);
      list.appendChild(item);
    });

    leaderboardSection.appendChild(list);
    card.appendChild(leaderboardSection);

    const actions = document.createElement('div');
    actions.className = 'action-buttons';

    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'btn-restart';
    restart.innerHTML =
      '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Play Again';

    restart.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('quiz:restart'));
    });

    actions.appendChild(restart);
    card.appendChild(actions);

    this.container.replaceChildren(card);
  }

  destroy() {
    this.destroyed = true;

    if (this.questionView) {
      this.questionView.destroy();
      this.questionView = null;
    }
  }
}
