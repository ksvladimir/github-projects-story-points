(function (d, w) {
'use strict';

var estimateRegEx = /^([\d\.]+) pt$/im;
const backlogColumn = '📒 Backlog';
const activeColumns = ['📅 Planned', '🚧 In progress', '🔬 In QA'];

const githubCredentials = new Promise(resolve => {
  chrome.storage.sync.get({ githubUser: '', githubToken: '' }, items => resolve(items));
});

var debounce = function (func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

var pluralize = (value) => (
  value === 1 ? '' : 's'
);

const getColumnCards = (column) => {
  return Array
    .from(column.getElementsByClassName('issue-card'))
    .filter(card => !card.classList.contains('sortable-ghost'))
    .filter(card => getComputedStyle(card).getPropertyValue('display') != 'none');
}

const moveTo = (card_id, position) => async (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.target.innerHTML = '⏳';

  const { githubUser, githubToken } = await githubCredentials;
  if (!githubUser || !githubToken) {
    alert('please set github credentials in Github Projects Story Points settings');
    return;
  }

  const res = await fetch(
    `https://api.github.com/projects/columns/cards/${card_id}/moves`, {
      headers: {
        'Authorization': 'Basic ' + btoa(githubUser + ":" + githubToken),
        'Accept': 'application/vnd.github.inertia-preview+json',
      },
      method: 'POST',
      body: JSON.stringify({ position }),
    }
  );
  if (!res.ok) {
    console.error(`Github API error: ${res.statusTest}\n${await res.text()}`);
    alert(`Github API error: ${res.statusTest}`);
  } else {
    /*
    const parentNode = card.parentNode;
    if (parentNode && position === 'top') {
      parentNode.prepend(card);
    } else if (parentNode && position === 'bottom') {
      parentNode.insertBefore(card, null);
    }
    */
  }

  return false;
}

const addCardButtonsForColumn = (column) => {
  const cards = getColumnCards(column);

  cards
    .filter(card => card.querySelectorAll('.gpsp-card-buttons').length == 0)
    .forEach(card => {
      const buttons = d.createElement('div');
      buttons.classList.add('gpsp-card-buttons');

      const addButton = (text, dir) => {
        const button = d.createElement('div');
        button.innerText = text;
        button.addEventListener('click', moveTo(card.dataset.cardId, dir), {capture: true});
        button.addEventListener('mousedown', e => { e.preventDefault(); }, {capture: true});
        buttons.append(button);
      };
      addButton('↑', 'top');
      addButton('↓', 'bottom');

      card.append(buttons);
    });

};

const resetCardButtonsForColumn = (column) => {
  column.querySelectorAll('.gpsp-card-button').forEach(el => el.remove());
};

var resetStoryPointsForColumn = (column) => {
  const customElements = Array.from(column.getElementsByClassName('github-project-story-points'));
  for (let e of customElements) {
    const parent = e.parentNode;
    if (parent.dataset.gpspOriginalContent) {
      parent.innerText = parent.dataset.gpspOriginalContent;
      delete parent.dataset.gpspOriginalContent;
    } else {
      parent.removeChild(e);
    }
  }
};

var titleWithTotalPoints = (title, points, unestimated) => {
  if (!points && !unestimated) {
    return title;
  }

  let summary = `${points} pts`;
  if (unestimated > 0) {
    summary = summary + `, ${unestimated} unestimated`;
  }

  return `${title} <span class="github-project-story-points" style="font-size:xx-small">(${summary})</span>`;
};

var updateTotalStoryPoints = () => {
  const project = d.getElementsByClassName('project-columns-container')[0];
  const columns = Array.from(project.getElementsByClassName('js-project-column')); // Was 'col-project-custom', but that's gitenterprise; github.com is 'project-column', fortunately, both have 'js-project-column'

  let points = 0;
  let unestimated = 0;
  for (let column of columns) {
    const titleElement = column.getElementsByClassName('js-project-column-name')[0];
    if (activeColumns.includes(titleElement.innerText)) {
      points += parseFloat(titleElement.dataset.gpspStoryPoints || 0);
      unestimated += parseFloat(titleElement.dataset.gpspUnestimated || 0);
    }
  }

  let summary = `active issues: ${points} pts`;
  if (unestimated > 0) {
    summary = summary + `, ${unestimated} unestimated`;
  }

  // Apply DOM changes:
  const projectTitle = d.querySelector('[data-hovercard-type=project]');
  const pointsElement = projectTitle.querySelector('.github-project-story-points') ||
    projectTitle.appendChild(document.createElement('span'));
  pointsElement.outerHTML = `<span class="github-project-story-points">(${summary})</span>`;
};

var addStoryPointsForColumn = (column) => {
  const columnCards = getColumnCards(column)
    .map(card => {
      const estimates = Array
        .from(card.getElementsByClassName('IssueLabel'))
        .map(label => parseFloat((label.innerText.trim().match(estimateRegEx) || [null, ''])[1]))
        .filter(x => !isNaN(x));

      const estimated = estimates.length > 0;
      const storyPoints = estimates.reduce((x, y) => x + y, 0);

      return {
        element: card,
        estimated,
        storyPoints
      };
    });

  let columnStoryPoints = 0;
  let columnUnestimated = 0;

  for (let card of columnCards) {
    columnStoryPoints += card.storyPoints;
    columnUnestimated += (card.estimated ? 0 : 1);
  }

  // Apply DOM changes:
  const columnCountElement = column.getElementsByClassName('js-column-card-count')[0];
  const titleElement = column.getElementsByClassName('js-project-column-name')[0];
  columnCountElement.innerHTML = titleWithTotalPoints(columnCards.length, columnStoryPoints, columnUnestimated);
  titleElement.dataset.gpspStoryPoints = columnStoryPoints;
  titleElement.dataset.gpspUnestimated = columnUnestimated;

  updateTotalStoryPoints();
};

var resets = [];

var start = debounce(() => {
  // Reset
  for (let reset of resets) {
    reset();
  }
  resets = [];
  // Projects
  const projects = d.getElementsByClassName('project-columns-container');
  if (projects.length > 0) {
    const project = projects[0];
    const columns = Array.from(project.getElementsByClassName('js-project-column')); // Was 'col-project-custom', but that's gitenterprise; github.com is 'project-column', fortunately, both have 'js-project-column'
    for (let column of columns) {
      const columnArea = Array.from(column.getElementsByClassName('js-project-column-cards'))[0];
      const addStoryPoints = ((c) => debounce(() => {
        resetStoryPointsForColumn(c);
        addStoryPointsForColumn(c);
        addCardButtonsForColumn(c);
      }, 50))(column);
      columnArea.addEventListener('DOMSubtreeModified', addStoryPoints);
      columnArea.addEventListener('drop', addStoryPoints);

      addStoryPointsForColumn(column);
      addCardButtonsForColumn(column);

      resets.push(((c) => () => {
        resetCardButtonsForColumn(c);
        resetStoryPointsForColumn(c);
        columnArea.removeEventListener('DOMSubtreeModified', addStoryPoints);
        columnArea.removeEventListener('drop', addStoryPoints);
      })(column));
    }
  }
}, 50);

// Hacks to restart the plugin on pushState change
w.addEventListener('statechange', () => setTimeout(() => {
  const timelines = d.getElementsByClassName('new-discussion-timeline');
  if (timelines.length > 0) {
    const timeline = timelines[0];
    const startOnce = () => {
      timeline.removeEventListener('DOMSubtreeModified', startOnce);
      start();
    };
    timeline.addEventListener('DOMSubtreeModified', startOnce);
  }
  start();
}, 500));

const addStyle = () => {
  const sheet = document.createElement('style');
  sheet.innerHTML = `
    .gpsp-card-buttons {
      visibility: hidden;
      position: absolute;
      top: 24px;
      right: 15px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .gpsp-card-buttons div {
      width: 16px;
      text-align: center;
      cursor: pointer;
    }
    .issue-card:hover .gpsp-card-buttons {
      visibility: visible;
    }
  `;
  document.body.appendChild(sheet);
};

// First start
start();

addStyle();

})(document, window);
