// Saves options to chrome.storage
function save_options() {
  const githubUser = document.getElementById('github-user').value;
  const githubToken = document.getElementById('github-token').value;
  chrome.storage.sync.set({ githubUser, githubToken, }, () => {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => status.textContent = '', 1500);
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  chrome.storage.sync.get({ githubUser: '', githubToken: '' }, items => {
    document.getElementById('github-user').value = items.githubUser;
    document.getElementById('github-token').value = items.githubToken;
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
