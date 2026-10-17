/** Install once per active GCP call. All setters must resolve after SDK state changes.
 * getState(): {connected, callId, room, mic_muted, deafened, volume}
 * setMicMuted(bool), setDeafened(bool), setVolume(0..100)
 * forceMute(): synchronous media-track gate used immediately on disconnect/timeout.
 * Browser UI changes must be reflected by getState().
 */
export function installMixerAdapter(api, environment = window) {
  for (const method of ['getState', 'setMicMuted', 'setDeafened', 'setVolume', 'forceMute']) {
    if (typeof api[method] !== 'function') throw new Error(`Missing mixer API: ${method}`);
  }
  let epoch = null, ack = 0, lastHeartbeat = 0, active = false, error = '';
  let generation = 0, chain = Promise.resolve(), disposed = false;
  let lastCall = api.getState().callId;
  function failClosed() {
    generation++;
    active = false;
    ack = 0;
    api.forceMute();
    // Reassert after any asynchronous SDK operation already in progress completes.
    chain = chain.catch(() => {}).then(() => api.setMicMuted(true)).catch(e => { error = e.message; });
  }
  function publish() {
    if (disposed) return;
    const state = api.getState();
    if (state.callId !== lastCall) { lastCall = state.callId; failClosed(); }
    if (active && Date.now() - lastHeartbeat > 1500) failClosed();
    environment.postMessage({channel: 'gcp-mixer-state-v2', payload: {state, epoch, ack, error, needsMute: !active}}, environment.location.origin);
  }
  function onMessage(event) {
    if (event.source !== environment || event.origin !== environment.location.origin ||
        event.data?.channel !== 'gcp-mixer-command-v2') return;
    const command = event.data.payload;
    if (command?.kind === 'disconnect') { if (active) failClosed(); return; }
    if (command?.kind !== 'command' || typeof command.epoch !== 'string' ||
        !Number.isInteger(command.revision) || !command.desired ||
        typeof command.binding !== 'string' ||
        !command.binding.endsWith(':' + api.getState().callId)) return;
    if (epoch !== command.epoch || !active) {
      failClosed();
      epoch = command.epoch;
      // Never execute a stale unmute during a new connection.
      if (command.desired.mic_muted !== true) return;
    }
    lastHeartbeat = Date.now();
    active = true;
    const version = generation;
    chain = chain.catch(() => {}).then(async () => {
      if (!active || disposed || version !== generation || command.revision <= ack) return;
      const desired = command.desired;
      for (const key of ['mic_muted', 'deafened']) {
        if (key in desired && typeof desired[key] !== 'boolean') throw new Error('Invalid mute command');
      }
      if ('volume' in desired && (!Number.isFinite(desired.volume) || desired.volume < 0 || desired.volume > 100)) throw new Error('Invalid volume');
      if ('mic_muted' in desired) await api.setMicMuted(desired.mic_muted);
      if (!active || version !== generation || Date.now() - lastHeartbeat > 1500) { api.forceMute(); return; }
      if ('deafened' in desired) await api.setDeafened(desired.deafened);
      if ('volume' in desired) await api.setVolume(desired.volume);
      if (!active || version !== generation) { api.forceMute(); return; }
      const actual = api.getState();
      for (const key of ['mic_muted', 'deafened', 'volume']) {
        if (key in desired && actual[key] !== desired[key]) throw new Error(`GCP did not confirm ${key}`);
      }
      ack = command.revision;
      error = '';
    }).catch(e => { error = e.message; failClosed(); });
  }
  environment.addEventListener('message', onMessage);
  const timer = environment.setInterval(publish, 100);
  publish();
  return () => {
    failClosed();
    disposed = true;
    environment.clearInterval(timer);
    environment.removeEventListener('message', onMessage);
  };
}
