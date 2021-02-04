(function (d, w) {
'use strict';

var estimateRegEx = /^([\d\.]+) pt$/im;

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

const activeColumns = ['📅 Planned', '🚧 In progress', '🔬 In QA'];

var updateTotalStoryPoints = () => {
  const project = d.getElementsByClassName('project-columns-container')[0];
  const columns = Array.from(project.getElementsByClassName('js-project-column')); // Was 'col-project-custom', but that's gitenterprise; github.com is 'project-column', fortunately, both have 'js-project-column'

  let points = 0;
  let unestimated = 0;
  for (let column of columns) {
    const titleElement = column.getElementsByClassName('js-project-column-name')[0];
    if (activeColumns.includes(titleElement.innerText)) {
      points += parseFloat(titleElement.dataset._extension_storyPoints || 0);
      unestimated += parseFloat(titleElement.dataset._extension_unestimated || 0);
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
  const columnCards = Array
    .from(column.getElementsByClassName('issue-card'))
    .filter(card => !card.classList.contains('sortable-ghost'))
    .filter(card => getComputedStyle(card).getPropertyValue('display') != 'none')
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
  titleElement.dataset._extension_storyPoints = columnStoryPoints;
  titleElement.dataset._extension_unestimated = columnUnestimated;

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
      }, 50))(column);
      columnArea.addEventListener('DOMSubtreeModified', addStoryPoints);
      columnArea.addEventListener('drop', addStoryPoints);
      addStoryPointsForColumn(column);
      resets.push(((c) => () => {
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

// First start
start();

})(document, window);
