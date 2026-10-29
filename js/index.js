
import Quiz from './quiz.js';

const form = document.getElementById('quizOptions');
const playerNameInput = document.getElementById('playerName');
const categoryInput = document.getElementById('categoryMenu');
const difficultyInput = document.getElementById('difficultyOptions');
const questionsNumberInput = document.getElementById('questionsNumber');
const startButton = document.getElementById('startQuiz');
const questionsContainer = document.getElementById('questionsContainer');

let activeQuiz = null;
let loadingElement = null;
let formErrorElement = null;
let requestInProgress = false;

// Get the player's name
function getPlayerName() {
  const playerName = playerNameInput.value.trim();

  if (playerName === '') {
    return 'Player';
  }

  return playerName;
}

// Check if the form values are correct
function validateForm() {
  const playerName = getPlayerName();
  const amount = Number(questionsNumberInput.value);
  const difficulty = difficultyInput.value;

  clearFormError();

  if (playerName.length > 20) {
    showFormError('Your name must be 20 characters or fewer.');
    playerNameInput.focus();
    return false;
  }

  if (!Number.isInteger(amount) || amount < 1 || amount > 50) {
    showFormError(
      'Please enter a number of questions between 1 and 50.'
    );

    questionsNumberInput.focus();
    return false;
  }

  if (
    difficulty !== 'easy' &&
    difficulty !== 'medium' &&
    difficulty !== 'hard' &&
    difficulty !== '' &&
    difficulty !== 'any'
  ) {
    showFormError('Please choose a valid difficulty level.');
    return false;
  }

  return true;
}

// Show an error message under the form
function showFormError(message) {
  clearFormError();

  formErrorElement = document.createElement('div');
  formErrorElement.className = 'form-error';
  formErrorElement.setAttribute('role', 'alert');

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-circle-exclamation';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = message;

  formErrorElement.append(icon);
  formErrorElement.append(text);

  form.insertBefore(formErrorElement, startButton);
}

// Remove the form error message
function clearFormError() {
  if (formErrorElement !== null) {
    formErrorElement.remove();
    formErrorElement = null;
  }
}

// Show the loading message
function showLoading(message = 'Loading Questions...') {
  hideLoading();

  loadingElement = document.createElement('div');
  loadingElement.className = 'loading-overlay';
  loadingElement.setAttribute('role', 'status');

  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('p');
  label.className = 'loading-text';
  label.textContent = message;

  loadingElement.append(spinner);
  loadingElement.append(label);

  questionsContainer.replaceChildren(loadingElement);
}

// Remove the loading message
function hideLoading() {
  if (loadingElement !== null) {
    loadingElement.remove();
    loadingElement = null;
  }
}

// Show an error card with a Try Again button
function showError(message, retryCallback = startQuiz) {
  hideLoading();

  const card = document.createElement('section');
  card.className = 'game-card error-card';

  const icon = document.createElement('div');
  icon.className = 'error-icon';
  icon.innerHTML =
    '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>';

  const heading = document.createElement('h3');
  heading.className = 'error-title';
  heading.textContent = 'Oops! Something went wrong';

  const messageElement = document.createElement('p');
  messageElement.className = 'error-message';
  messageElement.textContent = message;

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'btn-play retry-btn';
  retryButton.innerHTML =
    '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Try Again';

  retryButton.addEventListener('click', function () {
    if (requestInProgress === true) {
      return;
    }

    retryButton.disabled = true;
    retryButton.textContent = 'Please wait...';

    window.setTimeout(function () {
      if (retryButton.isConnected === true) {
        retryButton.disabled = false;
        retryButton.innerHTML =
          '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Try Again';
      }
    }, 3000);

    retryCallback();
  });

  card.append(icon);
  card.append(heading);
  card.append(messageElement);
  card.append(retryButton);

  questionsContainer.replaceChildren(card);
}

// Return to the start screen
function resetToStart() {
  if (activeQuiz !== null) {
    if (typeof activeQuiz.destroy === 'function') {
      activeQuiz.destroy();
    }
  }

  activeQuiz = null;
  requestInProgress = false;

  hideLoading();
  clearFormError();

  questionsContainer.replaceChildren();

  form.hidden = false;
  form.style.display = '';

  startButton.disabled = false;
  startButton.innerHTML =
    '<i class="fa-solid fa-play" aria-hidden="true"></i> Start Game';

  playerNameInput.focus();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Start the quiz
async function startQuiz() {
  if (requestInProgress === true) {
    return;
  }

  if (validateForm() === false) {
    return;
  }

  const settings = {
    playerName: getPlayerName(),
    category: categoryInput.value,
    difficulty: difficultyInput.value,
    amount: Number(questionsNumberInput.value)
  };

  clearFormError();

  requestInProgress = true;

  form.hidden = true;
  form.style.display = 'none';

  startButton.disabled = true;

  showLoading();

  try {
    activeQuiz = new Quiz(settings, questionsContainer, {
      onLoading: showLoading,

      onError: function (message, retryCallback) {
        requestInProgress = false;
        showError(message, retryCallback);
      }
    });

    await activeQuiz.start();
  } catch (error) {
    console.error('Unable to start QuizMaster:', error);

    requestInProgress = false;

    form.hidden = false;
    form.style.display = '';

    startButton.disabled = false;

    showError(
      error.message || 'Failed to load questions. Please try again.',
      startQuiz
    );
  }
}

// Start the quiz when the button is clicked
startButton.addEventListener('click', startQuiz);

// Prevent the form from refreshing the page
form.addEventListener('submit', function (event) {
  event.preventDefault();
  startQuiz();
});

// Remove form errors when the player changes the inputs
playerNameInput.addEventListener('input', clearFormError);
questionsNumberInput.addEventListener('input', clearFormError);

// Return to the start screen when the quiz is restarted
document.addEventListener('quiz:restart', resetToStart);

// Keep the number of questions between 1 and 50
questionsNumberInput.addEventListener('change', function () {
  const value = Number(questionsNumberInput.value);

  if (!Number.isFinite(value)) {
    return;
  }

  const questionCount = Math.trunc(value);

  if (questionCount < 1) {
    questionsNumberInput.value = '1';
  } else if (questionCount > 50) {
    questionsNumberInput.value = '50';
  } else {
    questionsNumberInput.value = String(questionCount);
  }
});
