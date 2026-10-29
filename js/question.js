
export default class Question {
  static audioContext = null;

  constructor({
    questionData,
    index,
    total,
    score,
    container,
    onAnswer,
    onNext,
    onScoreChange
  }) {
    this.data = questionData;
    this.index = index;
    this.total = total;
    this.score = score;
    this.container = container;

    this.onAnswer = onAnswer;
    this.onNext = onNext;
    this.onScoreChange = onScoreChange;

    this.timeLimit = 15;
    this.timeLeft = 15;
    this.timerId = null;
    this.answered = false;
    this.card = null;
    this.lastWarningSecond = null;

    this.keyHandler = this.handleKeydown.bind(this);
  }

  // Convert HTML entities into normal text
  decodeHtml(value) {
    const textarea = document.createElement('textarea');

    textarea.innerHTML = String(value ?? '');

    return textarea.value;
  }

  // Mix the answer choices in a random order
  shuffle(array) {
    const result = array.slice();

    for (let i = result.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));

      const temporaryAnswer = result[i];
      result[i] = result[randomIndex];
      result[randomIndex] = temporaryAnswer;
    }

    return result;
  }

  // Get the browser audio system
  getAudioContext() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      if (
        Question.audioContext === null ||
        Question.audioContext.state === 'closed'
      ) {
        Question.audioContext = new AudioContextClass();
      }

      return Question.audioContext;
    } catch (error) {
      console.warn('[QuizMaster] Audio is unavailable:', error);

      return null;
    }
  }

  // Play a sound using the browser
  playTone(
    frequency,
    duration,
    type = 'sine',
    volume = 0.08,
    delay = 0
  ) {
    const context = this.getAudioContext();

    if (context === null) {
      return;
    }

    function playSound() {
      if (context.state !== 'running') {
        return;
      }

      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        const startTime = context.currentTime + delay;
        const endTime = startTime + duration;

        oscillator.type = type;

        oscillator.frequency.setValueAtTime(
          frequency,
          startTime
        );

        gain.gain.setValueAtTime(0.0001, startTime);

        gain.gain.exponentialRampToValueAtTime(
          Math.max(volume, 0.001),
          startTime + 0.01
        );

        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          endTime
        );

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(startTime);
        oscillator.stop(endTime + 0.02);

        oscillator.onended = function () {
          oscillator.disconnect();
          gain.disconnect();
        };
      } catch (error) {
        console.warn('[QuizMaster] Could not play sound:', error);
      }
    }

    if (context.state === 'suspended') {
      context.resume().then(playSound).catch(function () {});
    } else {
      playSound();
    }
  }

  // Play a warning sound during the last five seconds
  playCountdownSound() {
    this.playTone(880, 0.09, 'square', 0.045);
  }

  // Play a dramatic sound when the time ends
  playTimeUpSound() {
    this.playTone(440, 0.22, 'sawtooth', 0.09, 0);
    this.playTone(330, 0.24, 'sawtooth', 0.09, 0.23);
    this.playTone(220, 0.48, 'sawtooth', 0.1, 0.48);
  }

  // Create the question card
  render() {
    const correctAnswer = this.decodeHtml(
      this.data.correct_answer
    );

    const answers = [
      {
        text: correctAnswer,
        correct: true
      }
    ];

    for (let i = 0; i < this.data.incorrect_answers.length; i++) {
      const answer = {
        text: this.decodeHtml(this.data.incorrect_answers[i]),
        correct: false
      };

      answers.push(answer);
    }

    this.answers = this.shuffle(answers);

    let category = 'General Knowledge';

    if (this.data.category) {
      category = this.decodeHtml(this.data.category);
    }

    let difficulty = 'easy';

    if (this.data.difficulty) {
      difficulty = String(this.data.difficulty).toLowerCase();
    }

    const progress = Math.round(
      ((this.index + 1) / this.total) * 100
    );

    const card = document.createElement('section');
    card.className = 'game-card question-card';

    card.innerHTML = `
      <div class="xp-bar-container">
        <div class="xp-bar-header">
          <span class="xp-label">
            <i class="fa-solid fa-bolt" aria-hidden="true"></i>
            Progress
          </span>
          <span class="xp-value">
            Question ${this.index + 1}/${this.total}
          </span>
        </div>

        <div class="xp-bar">
          <div
            class="xp-bar-fill"
            style="width: ${progress}%"
          ></div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-badge category">
          <i class="fa-solid fa-bookmark" aria-hidden="true"></i>
          <span class="category-value"></span>
        </div>

        <div class="stat-badge difficulty ${difficulty}">
          <i class="fa-solid fa-gauge-high" aria-hidden="true"></i>
          <span>${difficulty}</span>
        </div>

        <div class="stat-badge timer">
          <i class="fa-solid fa-stopwatch" aria-hidden="true"></i>
          <span class="timer-value">${this.timeLimit}</span>s
        </div>

        <div class="stat-badge counter">
          <i class="fa-solid fa-gamepad" aria-hidden="true"></i>
          <span>${this.index + 1}/${this.total}</span>
        </div>
      </div>

      <h2 class="question-text"></h2>

      <div class="answers-grid"></div>

      <p class="keyboard-hint">
        <i class="fa-regular fa-keyboard" aria-hidden="true"></i>
        Press 1-4 to select
      </p>

      <div class="score-panel">
        <div class="score-item">
          <div class="score-item-label">Score</div>
          <div class="score-item-value">${this.score}</div>
        </div>
      </div>
    `;

    card.querySelector('.category-value').textContent = category;

    card.querySelector('.question-text').textContent =
      this.decodeHtml(this.data.question);

    const answersGrid = card.querySelector('.answers-grid');

    for (let i = 0; i < this.answers.length; i++) {
      const answer = this.answers[i];

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-btn';
      button.dataset.answerIndex = String(i);

      const key = document.createElement('span');
      key.className = 'answer-key';
      key.textContent = String(i + 1);

      const text = document.createElement('span');
      text.className = 'answer-text';
      text.textContent = answer.text;

      button.append(key);
      button.append(text);

      button.addEventListener('click', () => {
        this.checkAnswer(i);
      });

      answersGrid.appendChild(button);
    }

    this.card = card;

    this.container.replaceChildren(card);

    document.addEventListener('keydown', this.keyHandler);

    this.startTimer();
  }

  // Start the countdown
  startTimer() {
    this.clearTimer();

    this.timeLeft = this.timeLimit;
    this.lastWarningSecond = null;

    this.updateTimerDisplay();

    this.timerId = window.setInterval(() => {
      if (this.answered === true) {
        return;
      }

      this.timeLeft = this.timeLeft - 1;

      this.updateTimerDisplay();

      // Play a beep at 5, 4, 3, 2 and 1 seconds
      if (
        this.timeLeft > 0 &&
        this.timeLeft <= 5 &&
        this.lastWarningSecond !== this.timeLeft
      ) {
        this.lastWarningSecond = this.timeLeft;

        this.playCountdownSound();
      }

      // End the question when the time reaches zero
      if (this.timeLeft <= 0) {
        this.timeUp();
      }
    }, 1000);
  }

  // Update the timer shown on the screen
  updateTimerDisplay() {
    if (this.card === null) {
      return;
    }

    const timer = this.card.querySelector('.stat-badge.timer');
    const value = this.card.querySelector('.timer-value');

    if (value !== null) {
      let displayedTime = this.timeLeft;

      if (displayedTime < 0) {
        displayedTime = 0;
      }

      value.textContent = String(displayedTime);
    }

    if (timer !== null) {
      if (this.timeLeft <= 5) {
        timer.classList.add('warning');
      } else {
        timer.classList.remove('warning');
      }
    }
  }

  // Allow the player to choose answers using keys 1 to 4
  handleKeydown(event) {
    if (this.answered || this.card === null) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (
      event.key !== '1' &&
      event.key !== '2' &&
      event.key !== '3' &&
      event.key !== '4'
    ) {
      return;
    }

    const target = event.target;

    if (target) {
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }
    }

    const answerIndex = Number(event.key) - 1;

    this.checkAnswer(answerIndex);
  }

  // Check the player's answer
  checkAnswer(answerIndex) {
    if (this.answered === true) {
      return;
    }

    if (!this.answers[answerIndex]) {
      return;
    }

    this.answered = true;

    // Stop the countdown as soon as an answer is selected
    this.clearTimer();

    document.removeEventListener('keydown', this.keyHandler);

    const buttons = this.card.querySelectorAll('.answer-btn');
    const chosen = this.answers[answerIndex];

    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;

      if (this.answers[i].correct === true) {
        buttons[i].classList.add('correct-reveal');
      } else if (i === answerIndex) {
        buttons[i].classList.add('wrong');
      } else {
        buttons[i].classList.add('disabled');
      }
    }

    if (chosen.correct === true) {
      buttons[answerIndex].classList.remove('correct-reveal');
      buttons[answerIndex].classList.add('correct');

      this.score = this.score + 1;

      if (this.onScoreChange) {
        this.onScoreChange(this.score);
      }

      if (this.onAnswer) {
        this.onAnswer(true);
      }

      const scoreValue = this.card.querySelector(
        '.score-item-value'
      );

      if (scoreValue !== null) {
        scoreValue.textContent = String(this.score);
      }
    } else {
      if (this.onAnswer) {
        this.onAnswer(false);
      }
    }

    // Show the next button without playing the time-up sound
    this.showNextButton();
  }

  // Handle a question that reaches zero seconds
  timeUp() {
    if (this.answered === true) {
      return;
    }

    this.answered = true;

    this.clearTimer();

    document.removeEventListener('keydown', this.keyHandler);

    this.playTimeUpSound();

    const buttons = this.card.querySelectorAll('.answer-btn');

    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;

      if (this.answers[i].correct === true) {
        buttons[i].classList.add('correct-reveal');
      } else {
        buttons[i].classList.add('disabled');
      }
    }

    const message = document.createElement('div');
    message.className = 'time-up-message';

    message.innerHTML =
      '<i class="fa-solid fa-clock" aria-hidden="true"></i> TIME\'S UP!';

    const answersGrid = this.card.querySelector('.answers-grid');

    answersGrid.insertAdjacentElement('afterend', message);

    if (this.onAnswer) {
      this.onAnswer(false);
    }

    this.showNextButton();
  }

  // Add the button for moving to the next question
  showNextButton() {
    const existingButton = this.card.querySelector(
      '.next-question-btn'
    );

    if (existingButton !== null) {
      return;
    }

    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'btn-play next-question-btn';

    if (this.index + 1 >= this.total) {
      button.innerHTML =
        'View Results <i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>';
    } else {
      button.innerHTML =
        'Next Question <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    }

    button.addEventListener('click', () => {
      this.destroy();
      this.onNext();
    });

    const hint = this.card.querySelector('.keyboard-hint');

    hint.insertAdjacentElement('afterend', button);
  }

  // Stop the countdown
  clearTimer() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  // Clean up the question when leaving it
  destroy() {
    this.clearTimer();

    document.removeEventListener('keydown', this.keyHandler);
  }
}
