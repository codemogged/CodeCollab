const crypto = require("crypto");

function createActivityService() {
  const events = [];
  let emit = () => undefined;

  function formatTime(date) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function addEvent(event) {
    const createdAt = new Date();
    const nextEvent = {
      id: event.id ?? crypto.randomUUID(),
      type: event.type,
      title: event.title,
      description: event.description,
      actor: event.actor ?? "CodeBuddy",
      actorInitials: event.actorInitials ?? "CB",
      time: event.time ?? formatTime(createdAt),
      relatedFile: event.relatedFile,
    };

    events.unshift(nextEvent);
    if (events.length > 30) {
      events.length = 30;
    }

    emit("activity:created", nextEvent);
    return nextEvent;
  }

  function listEvents() {
    return [...events];
  }

  return {
    addEvent,
    listEvents,
    __setEventSender(nextEmit) {
      emit = nextEmit;
    },
  };
}

module.exports = {
  createActivityService,
};