document.addEventListener('DOMContentLoaded', async () => {
  const room = new WebsimSocket();

  // Login Screen Elements
  const loginContainer = document.getElementById('login-container');
  const nicknameInput = document.getElementById('nickname-input');
  const rankCodeInput = document.getElementById('rank-code-input');
  const loginButton = document.getElementById('login-button');

  // Chat Elements
  const chatContainer = document.getElementById('chat-container');
  const userNicknameSpan = document.getElementById('user-nickname');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const chatMessages = document.getElementById('chat-messages');

  let isAdmin = false; // Flag to indicate admin status
  let isOwner = false; // Flag to indicate owner status
  let isMango = false; // Flag to indicate Mango status
  let nickname = '';
  let rank = 'student';
  let tempRankTimeout = null;

  // Function to load chat messages from local storage
  function loadChatMessages() {
    const savedMessages = localStorage.getItem('chatMessages');
    if (savedMessages) {
      const messages = JSON.parse(savedMessages);
      messages.forEach(msg => {
        appendMessage(msg.nickname, msg.message, msg.isAdmin, msg.isOwner, msg.isBot, msg.isMuted, msg.isMango, msg.rank, msg.tempRankColor);
      });
    }
  }

  // Function to save chat messages to local storage
  function saveChatMessage(nickname, messageText, isAdmin, isOwner, isBot = false, isMuted = false, isMango = false, rank = 'student', tempRankColor = null) {
    let savedMessages = localStorage.getItem('chatMessages');
    let messages = savedMessages ? JSON.parse(savedMessages) : [];

    messages.push({ nickname: nickname, message: messageText, isAdmin: isAdmin, isOwner: isOwner, isBot: isBot, isMuted: isMuted, isMango: isMango, rank: rank, tempRankColor: tempRankColor });

    // Limit the number of messages stored (e.g., 100 messages)
    if (messages.length > 100) {
      messages = messages.slice(messages.length - 100);
    }

    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }

  loginButton.addEventListener('click', () => {
    nickname = nicknameInput.value.trim();
    const rankCode = rankCodeInput.value.trim();

    if (nickname !== '') {
      // Validate admin rank code (example: "admin123")
      if (rankCode === 'admin123') {
        isAdmin = true;
        rank = 'admin';
        userNicknameSpan.textContent = `(Admin) ${nickname}`;
      } else if (rankCode === '47403') {
        isOwner = true;
        rank = 'owner';
        userNicknameSpan.textContent = `(Owner) ${nickname}`;
      } else if (rankCode === 'magno') {
        isMango = true;
        rank = 'mango';
        userNicknameSpan.textContent = `(Mango) ${nickname}`;
      } else {
        rank = 'student';
        userNicknameSpan.textContent = `(Student) ${nickname}`;
      }

      // Hide login container and show chat container
      loginContainer.style.display = 'none';
      chatContainer.style.display = 'flex';

      loadChatMessages(); // Load previous chat messages upon joining

      // Request previous chat messages upon joining
      room.send({ type: 'requestPreviousMessages' });
    } else {
      alert('Please enter a nickname.');
      return;
    }
  });

  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });

  async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText !== '') {

      if ((isOwner || isMango) && messageText.startsWith('/')) {
        handleOwnerCommand(messageText);
        messageInput.value = '';
        return;
      }

      room.send({
        type: 'chatMessage',
        nickname: nickname,
        isAdmin: isAdmin,
        isOwner: isOwner,
        isMango: isMango,
        rank: rank,
        message: messageText,
      });
      messageInput.value = '';

      // Save chat after sending message
      saveCurrentChat();

      // Check if owner or mango is sending a bot command
      if ((isOwner || isMango) && messageText.startsWith('+bot')) {
        const botQuery = messageText.substring(4).trim(); // Extract query after +bot
        const aiResponse = await getAIResponse(botQuery, true, nickname, isAdmin, isOwner, isMango);
        if (aiResponse) {
          // Send bot's response
          room.send({
            type: 'chatMessage',
            nickname: 'ChatBot',
            isAdmin: false,
            isOwner: false,
            isBot: true,
            message: aiResponse,
          });
        }
      }

    }
  }

  // Owner Command Handler
  async function handleOwnerCommand(command) {
    if (command.startsWith('/mute')) {
      const targetNickname = command.split(' ')[1];
      const muteDuration = parseInt(prompt('Enter mute duration in minutes:'));

      if (targetNickname && muteDuration > 0) {
        // Send a mute request to the server
        room.send({
          type: 'muteUser',
          targetNickname: targetNickname,
          muteDuration: muteDuration,
          ownerNickname: nickname,
        });
      } else {
        alert('Invalid nickname or mute duration.');
      }
    } else if (command.startsWith('/kick')) {
      const targetNickname = command.split(' ')[1];
      if (targetNickname) {
        // Send a kick request to the server
        room.send({
          type: 'kickUser',
          targetNickname: targetNickname,
          ownerNickname: nickname,
        });
      } else {
        alert('Invalid nickname.');
      }
    } else if (command === '/clearchat') {
      // Clear chat messages with countdown
      clearChatWithCountdown();
    } else if (command.startsWith('/temprank')) {
      handleTempRankCommand(command);
    } else {
      alert('Unknown command.');
    }
  }

  async function clearChatWithCountdown() {
    const countdownDuration = 5;
    let countdown = countdownDuration;

    const countdownInterval = setInterval(() => {
      const messageText = `Clearing chat in ${countdown}...`;
      room.send({
        type: 'chatMessage',
        nickname: 'ChatBot',
        isAdmin: false,
        isOwner: false,
        isBot: true,
        message: messageText,
      });

      countdown--;

      if (countdown < 0) {
        clearInterval(countdownInterval);
        clearChat();
      }
    }, 1000);
  }

  function clearChat() {
    chatMessages.innerHTML = ''; // Clear all messages from the chat window
    localStorage.removeItem('chatMessages'); // Clear chat messages from local storage

    // Notify all clients to clear their chat
    room.send({
      type: 'clearChat',
    });
  }

  function saveCurrentChat() {
    const messages = Array.from(chatMessages.children).map(messageDiv => {
      const nicknameSpan = messageDiv.querySelector('.nickname');
      const messageSpan = messageDiv.querySelector('span:last-child'); // Get the last span which contains the message text

      let nicknameText = nicknameSpan.textContent.trim();
      let isAdmin = nicknameText.includes('(Admin)');
      let isOwner = nicknameText.includes('Owner');
      let isBot = nicknameText.includes('Bot');
      let isMango = nicknameText.includes('Mango');
      let isMuted = messageDiv.classList.contains('muted');
      let rank = messageDiv.dataset.rank || 'student';
      let tempRankColor = messageDiv.dataset.tempRankColor || null;

      // Remove rank indicators from nickname for saving purposes
      nicknameText = nicknameText.replace('(Admin)', '').replace('Owner', '').replace('(Bot)', '').replace('(Mango)', '').replace('(Student)', '').replace(':', '').trim();

      return {
        nickname: nicknameText,
        message: messageSpan.textContent,
        isAdmin: isAdmin,
        isOwner: isOwner,
        isBot: isBot,
        isMuted: isMuted,
        isMango: isMango,
        rank: rank,
        tempRankColor: tempRankColor
      };
    });

    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }

  room.onmessage = (event) => {
    const data = event.data;
    switch (data.type) {
      case 'chatMessage':
        appendMessage(data.nickname, data.message, data.isAdmin, data.isOwner, data.isBot, false, data.isMango, data.rank, data.tempRankColor);
        saveChatMessage(data.nickname, data.message, data.isAdmin, data.isOwner, data.isBot, false, data.isMango, data.rank, data.tempRankColor); // Save message
        // Handle regular user questions for ChatBot
        if (!data.isBot && !data.isOwner && !data.isMango && data.message.toLowerCase().includes('bot')) {
          handleChatBotQuestion(data.message, data.nickname, isAdmin, isOwner, isMango);
        }
        break;
      case 'connected':
        console.log(`Client ${data.clientId}, ${data.username}, ${data.avatarUrl}`);
        break;
      case 'disconnected':
        console.log(`Client ${data.clientId}, ${data.username}, ${data.avatarUrl}`);
        break;
      case 'previousMessages':
        // Append previous messages to the chat
        data.messages.forEach(msg => {
          appendMessage(msg.nickname, msg.message, msg.isAdmin, msg.isOwner, msg.isBot, msg.isMuted, msg.isMango, msg.rank, msg.tempRankColor);
          saveChatMessage(msg.nickname, msg.message, msg.isAdmin, msg.isOwner, msg.isBot, msg.isMuted, msg.isMango, msg.rank, msg.tempRankColor); // Also save previous messages
        });
        break;
      case 'clearChat':
        // Clear chat messages from local storage
        localStorage.removeItem('chatMessages');
        chatMessages.innerHTML = '';
        break;
      case 'muteUser':
        handleMuteUser(data.targetNickname, data.muteDuration, data.ownerNickname);
        break;
      case 'kickUser':
        handleKickUser(data.targetNickname, data.ownerNickname);
        break;
      case 'userMuted':
        // Append a message to the chat indicating the mute action
        appendMessage('ChatBot', data.message, false, false, true);
        break;
      case 'userKicked':
        // Append a message to the chat indicating the kick action
        appendMessage('ChatBot', data.message, false, false, true);
        break;
      case 'tempRankGiven':
        // Handle the temp rank being assigned
        handleTempRankGiven(data.targetNickname, data.tempRankName, data.tempRankColor, data.duration);
        break;
      default:
        console.log('Received event:', data);
    }
  };

  function appendMessage(nickname, messageText, isAdmin = false, isOwner = false, isBot = false, isMuted = false, isMango = false, rank = 'student', tempRankColor = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.dataset.rank = rank; // Set the rank as a data attribute
    if (tempRankColor) {
      messageDiv.dataset.tempRankColor = tempRankColor;
    }

    if (isMuted) {
      messageDiv.classList.add('muted'); // Add muted style
    }

    let nicknameDisplay = nickname;
    let rankDisplay = '';

    if (isBot) {
      nicknameDisplay = 'ChatBot';
      rankDisplay = '<span class="bot-rank">Bot</span> ';
    } else if (isOwner) {
      rankDisplay = '<span class="owner-rank">Owner</span> ';
    } else if (isAdmin) {
      rankDisplay = '(Admin) ';
    } else if (isMango) {
      rankDisplay = '<span class="mango-rank">Mango</span> ';
    } else if (rank === 'student') {
      rankDisplay = '<span class="student-rank">Student</span> ';
    } else if (tempRankColor) {
      rankDisplay = `<span class="temprank" style="background: linear-gradient(to right, ${tempRankColor.split(',')[0]}, ${tempRankColor.split(',')[1]});">Temp Rank</span> `;
    }

    const nicknameSpan = document.createElement('span');
    nicknameSpan.classList.add('nickname');
    nicknameSpan.innerHTML = rankDisplay + nicknameDisplay + ': ';

    // Make nickname clickable for /kick and /mute commands
    if (isOwner || isMango) {
      nicknameSpan.style.cursor = 'pointer';
      nicknameSpan.addEventListener('click', () => {
        if (messageInput.value.startsWith('/kick')) {
          messageInput.value = `/kick ${nickname}`;
          clearCommandSuggestions();
        } else if (messageInput.value.startsWith('/mute')) {
          messageInput.value = `/mute ${nickname}`;
          clearCommandSuggestions();
        }
      });
    }

    messageDiv.appendChild(nicknameSpan);

    const messageSpan = document.createElement('span');
    messageSpan.textContent = messageText;
    messageDiv.appendChild(messageSpan);

    chatMessages.appendChild(messageDiv);

    // Scroll to the bottom to show the latest message
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (isBot) {
      messageDiv.classList.add('received'); // Style bot messages as received
    } else if (nickname === userNicknameSpan.textContent || nickname === `(Admin) ${nickname}` || nickname === `(Owner) ${nickname}` || nickname === `(Mango) ${nickname}` || nickname === `(Student) ${nickname}`) {
      messageDiv.classList.add('sent'); // Style user messages as sent
    } else {
      messageDiv.classList.add('received'); // Style other user messages as received
    }
  }

  room.party.subscribe((peers) => {
    // Update UI based on the list of peers (if needed)
    console.log('Peers updated:', peers);
  });

  async function getAIResponse(query, ownerCalledBot = false, userNickname = '', isAdmin = false, isOwner = false, isMango = false) {
    let prompt = `You are ChatBot, an AI assistant for the xChat website. Provide helpful and informative answers. If the question is not about the website, answer with 'This question is not related to the website.'. Do not discuss admin codes at all.`;
    let canBan = false;
    let canMute = false;
    let canKick = false;
    let canClearChat = false;
    let canTempRank = false;

    if (ownerCalledBot) {
      prompt = `You are ChatBot, an AI assistant. Respond to the following query.`;
      if (isOwner || isMango) {
        canBan = true;
        canMute = true;
        canKick = true;
        canClearChat = true;
        canTempRank = true;
      }
    }

    // Add rank context to the prompt
    let userRank = 'user';
    if (isAdmin) userRank = 'admin';
    if (isOwner) userRank = 'owner';
    if (isMango) userRank = 'mango';
    prompt += ` The user asking is a ${userRank}.`;

    try {
      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `
          ${prompt}

          Here are the available actions:
          ${canBan ? '- ban (requires reason and target)' : ''}
          ${canMute ? '- mute (requires duration in minutes, reason and target)' : ''}
          ${canKick ? '- kick (requires target)' : ''}
          ${canClearChat ? '- clear chat' : ''}
          ${canTempRank ? '- temprank (requires target, rank name, color gradient (e.g., #FF0000,#00FF00), and duration in minutes.  If you are asked to reset to default, use rank student and no duration)' : ''}

          Respond in a helpful and informative way. If the user is being abusive, or requests an action, use the actions above.
          If you don't understand an action, ignore it.

          <typescript-interface>
          interface Response {
            answer: string;
          }
          </typescript-interface>
          <example>
          {
            "answer": "The website is a chat application."
          }
          </example>
          `,
          data: query
        }),
      });
      const data = await response.json();
      return data.answer;
    } catch (error) {
      console.error('Error fetching AI response:', error);
      return 'An error occurred while processing your request.';
    }
  }

  async function handleChatBotQuestion(message, userNickname, isAdmin, isOwner, isMango) {
    const aiResponse = await getAIResponse(message, false, userNickname, isAdmin, isOwner, isMango);
    if (aiResponse) {
      // Send bot's response to the chat
      room.send({
        type: 'chatMessage',
        nickname: 'ChatBot',
        isAdmin: false,
        isOwner: false,
        isBot: true,
        message: `${userNickname}, ${aiResponse}`,
      });
    }
  }

  // Command Suggestion Feature

  messageInput.addEventListener('input', function () {
    const inputValue = this.value;
    const commandList = (isOwner || isMango) ? ['/mute', '/kick', '/clearchat', '/temprank'] : ['/resetrank']; // List of commands

    if (inputValue.startsWith('/')) {
      const matchingCommands = commandList.filter(command => command.startsWith(inputValue));

      if (matchingCommands.length > 0) {
        // Display command suggestions
        displayCommandSuggestions(matchingCommands, this);
      } else {
        // Clear suggestions if no match
        clearCommandSuggestions();
      }
    } else {
      // Clear suggestions if input doesn't start with '/'
      clearCommandSuggestions();
    }
  });
  function displayCommandSuggestions(commands, inputElement) {
    // Check if the suggestion box already exists
    let suggestionBox = document.getElementById('command-suggestions');

    // If it doesn't exist, create it
    if (!suggestionBox) {
      suggestionBox = document.createElement('div');
      suggestionBox.id = 'command-suggestions';
      suggestionBox.style.position = 'absolute';
      suggestionBox.style.backgroundColor = '#333';
      suggestionBox.style.color = 'white';
      suggestionBox.style.borderRadius = '4px';
      suggestionBox.style.padding = '5px';
      suggestionBox.style.zIndex = '1000'; // Ensure it's on top
      suggestionBox.style.width = inputElement.offsetWidth + 'px';
      suggestionBox.style.marginTop = '2px';

      // Position the suggestion box right below the input element
      const inputRect = inputElement.getBoundingClientRect();
      suggestionBox.style.top = (inputRect.top + inputRect.height + window.scrollY) + 'px';
      suggestionBox.style.left = (inputRect.left + window.scrollX) + 'px';

      // Append it to the body
      document.body.appendChild(suggestionBox);
    }

    // Clear any existing suggestions
    suggestionBox.innerHTML = '';

    // Add each command as a suggestion
    commands.forEach(command => {
      const suggestion = document.createElement('div');
      suggestion.textContent = command;
      suggestion.style.padding = '3px';
      suggestion.style.cursor = 'pointer';

      // Highlight the matched part of the command
      let matchLength = inputElement.value.length;
      let matchedText = command.substring(0, matchLength);
      let restOfText = command.substring(matchLength);

      suggestion.innerHTML = `<strong>${matchedText}</strong>${restOfText}`;

      suggestion.addEventListener('click', function () {
        inputElement.value = command; // Fill the input with the selected command
        clearCommandSuggestions(); // Clear the suggestion box
        inputElement.focus(); // Refocus on the input
      });

      suggestionBox.appendChild(suggestion);
    });
  }

  function clearCommandSuggestions() {
    const suggestionBox = document.getElementById('command-suggestions');
    if (suggestionBox) {
      suggestionBox.remove();
    }
  }

  function handleMuteUser(targetNickname, muteDuration, ownerNickname) {

    const messageText = `(Owner) ${ownerNickname} muted ${targetNickname} for ${muteDuration} minutes.`;

    // Notify all clients about the mute action
    room.send({
      type: 'userMuted',
      message: messageText,
    });

    // Find and mute the user
    const messages = chatMessages.querySelectorAll('.message');
    messages.forEach(message => {
      const nicknameSpan = message.querySelector('.nickname');
      if (nicknameSpan && nicknameSpan.textContent.includes(targetNickname)) {
        message.classList.add('muted'); // Add a class to visually indicate the message is muted
      }
    });

    // Set a timeout to unmute the user after the specified duration
    setTimeout(() => {
      // Unmute the user by removing the 'muted' class
      messages.forEach(message => {
        const nicknameSpan = message.querySelector('.nickname');
        if (nicknameSpan && nicknameSpan.textContent.includes(targetNickname)) {
          message.classList.remove('muted');
        }
      });

      // Append a message to the chat indicating the unmute action
      const unmuteMessageText = `(Owner) ${ownerNickname} unmuted ${targetNickname}.`;

      room.send({
        type: 'chatMessage',
        nickname: 'ChatBot',
        isAdmin: false,
        isOwner: false,
        isBot: true,
        message: unmuteMessageText,
      });

    }, muteDuration * 60 * 1000); // Convert minutes to milliseconds
  }

  function handleKickUser(targetNickname, ownerNickname) {
    // Append a message to the chat indicating the kick action
    const messageText = `(Owner) ${ownerNickname} kicked ${targetNickname}.`;

    // Notify all clients about the kick action
    room.send({
      type: 'userKicked',
      message: messageText,
    });

    // Disconnect the target user (This part depends on how you manage users)
    // For example, if you have a list of connected users, remove the target user.

    // Refresh the page to "kick" the user (This is just a simulation, adjust as needed)
    if (nickname === targetNickname) {
      // Redirect the user to the login page
      loginContainer.style.display = 'flex';
      chatContainer.style.display = 'none';
    }
  }
  // Handle /temprank command
  async function handleTempRankCommand(command) {
    const commandParts = command.split(' ');
    if (commandParts.length < 2) {
      alert('Usage: /temprank <parameters for AI to decide>');
      return;
    }

    const aiQuery = commandParts.slice(1).join(' '); // Combine parameters for AI

    // Call AI to determine target nickname, rank name, color, and duration
    const aiResponse = await getAIResponse(`/temprank ${aiQuery}`, true, nickname, isAdmin, isOwner, isMango);

    if (aiResponse) {
      // Extract info from AI response
      const tempRankInfo = extractTempRankInfo(aiResponse);

      if (tempRankInfo && tempRankInfo.targetNickname && tempRankInfo.tempRankName && tempRankInfo.tempRankColor && tempRankInfo.duration) {
        // Send the info to server
        room.send({
          type: 'tempRankGiven',
          targetNickname: tempRankInfo.targetNickname,
          tempRankName: tempRankInfo.tempRankName,
          tempRankColor: tempRankInfo.tempRankColor,
          duration: tempRankInfo.duration
        });

        // Apply the temp rank locally
        handleTempRankGiven(tempRankInfo.targetNickname, tempRankInfo.tempRankName, tempRankInfo.tempRankColor, tempRankInfo.duration);
      } else {
        alert('Could not determine a target nickname, rank name, color, and duration. Please try again.');
      }
    } else {
      alert('Failed to get response from AI.');
    }
  }

  function extractTempRankInfo(aiResponse) {
    try {
      // Use regular expressions to extract information from the AI response
      const targetNicknameMatch = aiResponse.match(/target:\s*(\w+)/i);
      const tempRankNameMatch = aiResponse.match(/rank:\s*(\w+)/i);
      const tempRankColorMatch = aiResponse.match(/color:\s*([#\w]+(?:,\s*[#\w]+)?)/i); // Adjusted to capture comma-separated values
      const durationMatch = aiResponse.match(/duration:\s*(\d+)/i);

      if (targetNicknameMatch && tempRankNameMatch && tempRankColorMatch && durationMatch) {
        return {
          targetNickname: targetNicknameMatch[1],
          tempRankName: tempRankNameMatch[1],
          tempRankColor: tempRankColorMatch[1],
          duration: parseInt(durationMatch[1])
        };
      } else {
        console.warn("Could not extract all necessary information from the AI response.");
        return null;
      }
    } catch (error) {
      console.error("Error extracting temp rank info:", error);
      return null;
    }
  }

  function handleTempRankGiven(targetNickname, tempRankName, tempRankColor, duration) {
    const messages = chatMessages.querySelectorAll('.message');
    messages.forEach(message => {
      const nicknameSpan = message.querySelector('.nickname');
      if (nicknameSpan && nicknameSpan.textContent.includes(targetNickname)) {
        // Apply temp rank name and color locally
        message.dataset.tempRankName = tempRankName;
        message.dataset.tempRankColor = tempRankColor;

        // Update the nickname display with the temp rank
        nicknameSpan.innerHTML = `<span class="temprank" style="background: linear-gradient(to right, ${tempRankColor.split(',')[0]}, ${tempRankColor.split(',')[1]});">${tempRankName}</span> ${nicknameSpan.textContent}`;
      }
    });

    // If a timeout is already running, clear it
    if (tempRankTimeout) {
      clearTimeout(tempRankTimeout);
    }

    // Set a timeout to clear the temp rank after the specified duration
    tempRankTimeout = setTimeout(() => {
      removeTempRank(targetNickname);
    }, duration * 60 * 1000);
  }

  function removeTempRank(targetNickname) {
    const messages = chatMessages.querySelectorAll('.message');
    messages.forEach(message => {
      const nicknameSpan = message.querySelector('.nickname');
      if (nicknameSpan && nicknameSpan.textContent.includes(targetNickname)) {
        // Remove temp rank data attributes
        delete message.dataset.tempRankName;
        delete message.dataset.tempRankColor;

        // Reconstruct nickname display without the temp rank
        const nicknameText = nicknameSpan.textContent.replace(/<span class="temprank".*?<\/span>\s*/, ''); // Remove temp rank span
        nicknameSpan.innerHTML = nicknameText;
      }
    });
  }

  // Listen for bot mentions

  chatMessages.addEventListener('click', async (event) => {
    if (event.target.classList.contains('nickname') && !(isOwner || isMango)) {
      const clickedNickname = event.target.textContent.replace('(Admin)', '').replace('(Owner)', '').replace('(Bot)', '').replace('(Mango)', '').replace(':', '').trim();
      if (messageInput.value.toLowerCase().includes('bot')) {
        handleChatBotQuestion(messageInput.value, clickedNickname, isAdmin, isOwner, isMango);
      }
    }
  });
});