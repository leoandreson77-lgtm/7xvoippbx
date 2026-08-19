const AGENT_STATUS = {
  OFFLINE: 'OFFLINE',
  CONNECTING: 'CONNECTING',
  ONLINE: 'ONLINE',
  RINGING: 'RINGING',
  IN_CALL: 'IN_CALL',
  ON_HOLD: 'ON_HOLD',
};

const CALL_DIRECTION = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
};

const CALL_STATUS = {
  ANSWERED: 'answered',
  MISSED: 'missed',
  REJECTED: 'rejected',
  FAILED: 'failed',
};

const WS_EVENTS = {
  // Server → Client
  REGISTRATION_STATUS: 'registration_status',
  INCOMING_CALL: 'incoming_call',
  CALL_ANSWERED: 'call_answered',
  CALL_ENDED: 'call_ended',
  CALL_FAILED: 'call_failed',
  AGENT_STATUS_CHANGED: 'agent_status_changed',
  CALL_HELD: 'call_held',
  CALL_RESUMED: 'call_resumed',

  // Client → Server
  STATUS_UPDATE: 'status_update',
  CALL_ACTION: 'call_action',
};

const ROLES = {
  AGENT: 'agent',
  ADMIN: 'admin',
};

const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  EXTENSION_CREATED: 'EXTENSION_CREATED',
  EXTENSION_UPDATED: 'EXTENSION_UPDATED',
  EXTENSION_DELETED: 'EXTENSION_DELETED',
  AGENT_CREATED: 'AGENT_CREATED',
  AGENT_UPDATED: 'AGENT_UPDATED',
  CALL_STARTED: 'CALL_STARTED',
  CALL_ENDED: 'CALL_ENDED',
};

module.exports = {
  AGENT_STATUS,
  CALL_DIRECTION,
  CALL_STATUS,
  WS_EVENTS,
  ROLES,
  AUDIT_ACTIONS,
};
