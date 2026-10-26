export type MusicTrack = "none" | "menu" | "battle" | "boss";

// MIDI note to frequency helper
function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class SoundController {
  private ctx: AudioContext | null = null;
  private musicMasterGain: GainNode | null = null;
  private sfxMasterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicVolume = 0.7; // 0.0 .. 1.0
  private sfxVolume = 0.8; // 0.0 .. 1.0

  private currentTrack: MusicTrack = "none";
  private stepIndex = 0;
  private schedulerTimer: number | null = null;
  private unlockListenersBound = false;

  private xpComboCount = 0;
  private lastXpTime = 0;
  private lastHitTime = 0;
  private lastCritHitTime = 0;
  private lastShootTime = 0;

  constructor() {
    if (typeof window !== "undefined") {
      this.bindAutoplayUnlock();
    }
  }

  private bindAutoplayUnlock(): void {
    if (this.unlockListenersBound || typeof window === "undefined") return;
    this.unlockListenersBound = true;

    const unlock = () => {
      if (this.muted) return;
      const ctx = this.ensureContext();
      if (
        ctx &&
        ctx.state === "running" &&
        this.currentTrack !== "none" &&
        this.musicVolume > 0 &&
        this.schedulerTimer === null
      ) {
        this.startScheduler();
      }
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended" && !this.muted) {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.musicMasterGain) {
      this.musicMasterGain = this.ctx.createGain();
      this.musicMasterGain.gain.setValueAtTime(
        this.muted ? 0 : this.musicVolume * 0.9,
        this.ctx.currentTime
      );
      this.musicMasterGain.connect(this.ctx.destination);
    }
    if (this.ctx && !this.sfxMasterGain) {
      this.sfxMasterGain = this.ctx.createGain();
      this.sfxMasterGain.gain.setValueAtTime(
        this.muted ? 0 : this.sfxVolume,
        this.ctx.currentTime
      );
      this.sfxMasterGain.connect(this.ctx.destination);
    }
    if (this.ctx && !this.noiseBuffer) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.25);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  private syncGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.musicMasterGain) {
      this.musicMasterGain.gain.cancelScheduledValues(now);
      this.musicMasterGain.gain.setValueAtTime(
        this.muted ? 0 : this.musicVolume * 0.9,
        now
      );
    }
    if (this.sfxMasterGain) {
      this.sfxMasterGain.gain.cancelScheduledValues(now);
      this.sfxMasterGain.gain.setValueAtTime(
        this.muted ? 0 : this.sfxVolume,
        now
      );
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    this.syncGains();
    if (mute) {
      this.stopScheduler();
    } else if (this.currentTrack !== "none" && this.musicVolume > 0) {
      this.ensureContext();
      this.startScheduler();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.musicVolume > 0 && this.muted) {
      this.muted = false;
    }
    this.ensureContext();
    this.syncGains();

    if (this.musicVolume <= 0) {
      this.stopScheduler();
    } else if (
      !this.muted &&
      this.currentTrack !== "none" &&
      this.schedulerTimer === null
    ) {
      this.startScheduler();
    }
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxVolume > 0 && this.muted) {
      this.muted = false;
    }
    this.ensureContext();
    this.syncGains();
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setMusicTrack(track: MusicTrack): void {
    if (this.currentTrack === track) {
      if (
        !this.muted &&
        this.musicVolume > 0 &&
        track !== "none" &&
        this.schedulerTimer === null
      ) {
        this.ensureContext();
        this.startScheduler();
      }
      return;
    }

    this.currentTrack = track;
    this.stepIndex = 0;
    this.stopScheduler();

    if (track !== "none" && !this.muted && this.musicVolume > 0) {
      this.ensureContext();
      this.startScheduler();
    }
  }

  // Slowed down by 30% compared to previous speeds (interval / 0.7)
  private getStepIntervalMs(track: MusicTrack): number {
    if (track === "menu") return 236; // ~63 BPM slow gothic sanctum
    if (track === "boss") return 132; // ~114 BPM heavy dread boss
    return 164; // ~91 BPM steady catacomb battle groove
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private startScheduler(): void {
    if (
      typeof window === "undefined" ||
      this.muted ||
      this.musicVolume <= 0 ||
      this.currentTrack === "none"
    ) {
      return;
    }
    this.stopScheduler();

    const intervalMs = this.getStepIntervalMs(this.currentTrack);
    this.tickMusicStep();
    this.schedulerTimer = window.setInterval(() => {
      this.tickMusicStep();
    }, intervalMs);
  }

  private tickMusicStep(): void {
    if (this.muted || this.musicVolume <= 0 || this.currentTrack === "none") return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== "running" || !this.musicMasterGain) return;

    const step = this.stepIndex % 32;
    this.stepIndex = (this.stepIndex + 1) % 32;

    if (this.currentTrack === "menu") {
      this.playMenuStep(ctx, this.musicMasterGain, step);
    } else if (this.currentTrack === "battle") {
      this.playBattleStep(ctx, this.musicMasterGain, step);
    } else if (this.currentTrack === "boss") {
      this.playBossStep(ctx, this.musicMasterGain, step);
    }
  }

  // ==================== 1. HOMEPAGE / SANCTUM THEME ("menu") ====================
  private playMenuStep(ctx: AudioContext, dest: AudioNode, step: number): void {
    const now = ctx.currentTime;
    const bar = Math.floor(step / 8);

    // Cathedral Pad Chords on beat 0 of each 8-step bar: Dm -> BbMaj7 -> Gm -> A7
    if (step % 8 === 0) {
      const chords: number[][] = [
        [50, 53, 57, 62], // Dm
        [46, 53, 57, 62], // BbMaj7
        [43, 50, 55, 58], // Gm
        [45, 52, 57, 61], // A7
      ];
      const chord = chords[bar] || chords[0];
      for (const midi of chord) {
        this.playFilteredNote(ctx, dest, {
          freq: mtof(midi),
          type: "triangle",
          start: now,
          duration: 1.85,
          attack: 0.24,
          gain: 0.03,
          cutoff: 900,
        });
      }

      // Deep Sanctuary Bell Sub-Bass
      const bassRoots = [38, 34, 31, 33]; // D2, Bb1, G1, A1
      this.playFilteredNote(ctx, dest, {
        freq: mtof(bassRoots[bar]),
        type: "sine",
        start: now,
        duration: 1.8,
        attack: 0.05,
        gain: 0.068,
        cutoff: 320,
      });
    }

    // Haunting Harpsichord / Celesta Arpeggio (32-step sequence)
    const arpNotes: (number | null)[] = [
      62, 65, 69, 74, 69, 65, 64, 65,
      58, 62, 65, 69, 65, 62, 60, 62,
      55, 58, 62, 67, 62, 58, 57, 58,
      57, 61, 64, 67, 65, 64, 61, 57,
    ];
    const note = arpNotes[step];
    if (note !== null) {
      this.playFilteredNote(ctx, dest, {
        freq: mtof(note),
        type: "triangle",
        start: now,
        duration: 0.34,
        attack: 0.01,
        gain: step % 4 === 0 ? 0.044 : 0.03,
        cutoff: 2200,
      });
    }

    // High spectral chime on step 4 of bars 0 and 2
    if (step === 4 || step === 20) {
      const chimeMidi = step === 4 ? 81 : 79;
      this.playFilteredNote(ctx, dest, {
        freq: mtof(chimeMidi),
        type: "sine",
        start: now,
        duration: 0.78,
        attack: 0.012,
        gain: 0.024,
        cutoff: 3200,
      });
    }
  }

  // ==================== 2. GAMEPLAY BATTLE THEME ("battle") ====================
  private playBattleStep(ctx: AudioContext, dest: AudioNode, step: number): void {
    const now = ctx.currentTime;
    const bar = Math.floor(step / 8);

    // Galloping Bassline (Dm -> Bb -> C -> A7)
    const bassPatterns: number[][] = [
      [38, 38, 50, 38, 41, 38, 43, 45], // Dm
      [34, 34, 46, 34, 38, 34, 36, 38], // Bb
      [36, 36, 48, 36, 40, 36, 41, 43], // C
      [33, 33, 45, 33, 36, 33, 37, 40], // A7
    ];
    const bassMidi = bassPatterns[bar][step % 8];
    this.playFilteredNote(ctx, dest, {
      freq: mtof(bassMidi),
      type: "sawtooth",
      start: now,
      duration: 0.145,
      attack: 0.006,
      gain: step % 2 === 0 ? 0.05 : 0.036,
      cutoff: 680,
    });

    // Gothic Lead Melody
    const leadMelody: (number | null)[] = [
      74, null, 69, 65, 67, 69, 70, 69,
      67, null, 65, 62, 64, 65, 67, 69,
      70, null, 69, 67, 72, null, 70, 69,
      69, 68, 69, 73, 76, null, 73, 69,
    ];
    const leadMidi = leadMelody[step];
    if (leadMidi !== null) {
      const hold = leadMelody[(step + 1) % 32] === null ? 0.3 : 0.155;
      this.playFilteredNote(ctx, dest, {
        freq: mtof(leadMidi),
        type: "square",
        start: now,
        duration: hold,
        attack: 0.008,
        gain: 0.032,
        cutoff: 1850,
      });
    }

    // Counter-Harmony Stabs on offbeats (steps 2, 6 of each bar)
    if (step % 4 === 2) {
      const harmonyChords: number[][] = [
        [57, 62],
        [53, 58],
        [55, 60],
        [52, 61],
      ];
      for (const m of harmonyChords[bar]) {
        this.playFilteredNote(ctx, dest, {
          freq: mtof(m),
          type: "triangle",
          start: now,
          duration: 0.16,
          attack: 0.006,
          gain: 0.026,
          cutoff: 1400,
        });
      }
    }

    // Percussion
    if (step % 4 === 0 || step % 8 === 7) {
      this.playSynthKick(ctx, dest, now, step % 4 === 0 ? 0.075 : 0.048);
    }
    if (step % 4 === 2) {
      this.playSynthSnare(ctx, dest, now, 0.032, 0.085);
    } else if (step % 2 === 1) {
      this.playSynthHat(ctx, dest, now, 0.014);
    }
  }

  // ==================== 3. BOSS ENCOUNTER THEME ("boss") ====================
  private playBossStep(ctx: AudioContext, dest: AudioNode, step: number): void {
    const now = ctx.currentTime;
    const bar = Math.floor(step / 8);

    // Relentless Phrygian / Diminished Bass Ostinato
    const bossBass: number[][] = [
      [38, 50, 39, 38, 38, 50, 39, 41],
      [38, 50, 44, 43, 41, 39, 38, 37],
      [34, 46, 35, 34, 31, 43, 33, 34],
      [33, 45, 34, 33, 37, 40, 43, 49],
    ];
    const bMidi = bossBass[bar][step % 8];
    this.playFilteredNote(ctx, dest, {
      freq: mtof(bMidi),
      type: "sawtooth",
      start: now,
      duration: 0.125,
      attack: 0.005,
      gain: step % 2 === 0 ? 0.062 : 0.045,
      cutoff: 920,
    });

    // Aggressive Brass / Organ Power Stabs on syncopated accents (steps 0, 3, 6 of each bar)
    const subStep = step % 8;
    if (subStep === 0 || subStep === 3 || subStep === 6) {
      const stabChords: number[][] = [
        [50, 57, 62],
        [51, 56, 62],
        [46, 53, 58],
        [45, 52, 61],
      ];
      for (const m of stabChords[bar]) {
        this.playFilteredNote(ctx, dest, {
          freq: mtof(m),
          type: "sawtooth",
          start: now,
          duration: 0.17,
          attack: 0.005,
          gain: 0.034,
          cutoff: 1650,
        });
      }
    }

    // Frantic Boss Lead Motif
    const bossLead: (number | null)[] = [
      74, 75, 74, 73, 74, 77, 75, 74,
      80, 79, 77, 75, 74, 73, 74, null,
      70, 74, 77, 76, 77, 82, 81, 79,
      81, 79, 77, 76, 73, 76, 79, 85,
    ];
    const lMidi = bossLead[step];
    if (lMidi !== null) {
      this.playFilteredNote(ctx, dest, {
        freq: mtof(lMidi),
        type: "square",
        start: now,
        duration: 0.12,
        attack: 0.005,
        gain: 0.035,
        cutoff: 2400,
      });
    }

    // Double-time War Drums
    if (subStep === 0 || subStep === 2 || subStep === 3 || subStep === 6) {
      this.playSynthKick(ctx, dest, now, subStep === 0 ? 0.095 : 0.065);
    }
    if (subStep === 4 || (bar === 3 && subStep === 7)) {
      this.playSynthSnare(ctx, dest, now, 0.048, 0.095);
    } else if (step % 2 === 1) {
      this.playSynthHat(ctx, dest, now, 0.018);
    }
  }

  private playFilteredNote(
    ctx: AudioContext,
    dest: AudioNode,
    opts: {
      freq: number;
      type: OscillatorType;
      start: number;
      duration: number;
      attack: number;
      gain: number;
      cutoff: number;
    }
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gainNode = ctx.createGain();

    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, opts.start);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.cutoff, opts.start);

    gainNode.gain.setValueAtTime(0.0001, opts.start);
    gainNode.gain.linearRampToValueAtTime(opts.gain, opts.start + opts.attack);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      opts.start + opts.duration
    );

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);

    osc.start(opts.start);
    osc.stop(opts.start + opts.duration + 0.01);
  }

  private playSynthKick(
    ctx: AudioContext,
    dest: AudioNode,
    start: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(128, start);
    osc.frequency.exponentialRampToValueAtTime(36, start + 0.085);

    gain.gain.setValueAtTime(peakGain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + 0.095);
  }

  private playSynthSnare(
    ctx: AudioContext,
    dest: AudioNode,
    start: number,
    peakGain: number,
    duration: number
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, start);
    filter.Q.setValueAtTime(0.9, start);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.start(start);
    src.stop(start + duration + 0.01);
  }

  private playSynthHat(
    ctx: AudioContext,
    dest: AudioNode,
    start: number,
    peakGain: number
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(5500, start);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.start(start);
    src.stop(start + 0.045);
  }

  // ==================== SOUND EFFECTS ====================
  private getSfxDest(): { ctx: AudioContext; dest: AudioNode } | null {
    if (this.muted || this.sfxVolume <= 0) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return null;
    return { ctx, dest: this.sfxMasterGain };
  }

  public playShoot(freq = 360): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const now = ctx.currentTime;
    if (now - this.lastShootTime < 0.09) return;
    this.lastShootTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.07);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playHit(isCrit = false): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const now = ctx.currentTime;
    if (now - this.lastHitTime < 0.14) {
      if (!isCrit || now - this.lastCritHitTime < 0.18) return;
    }
    this.lastHitTime = now;
    if (isCrit) {
      this.lastCritHitTime = now;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isCrit ? "triangle" : "sine";
    osc.frequency.setValueAtTime(isCrit ? 240 : 155, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + (isCrit ? 0.065 : 0.045));
    gain.gain.setValueAtTime(isCrit ? 0.038 : 0.024, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.065 : 0.045));
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + (isCrit ? 0.07 : 0.05));
  }

  public playXpGem(): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const now = ctx.currentTime;
    if (now - this.lastXpTime < 0.055) return;
    if (now - this.lastXpTime < 0.35) {
      this.xpComboCount = Math.min(14, this.xpComboCount + 1);
    } else {
      this.xpComboCount = 0;
    }
    this.lastXpTime = now;

    const baseFreq = 520 + this.xpComboCount * 38;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.065);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playLevelUp(): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }

  public playEvolution(): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const chord = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    chord.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.07, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + 0.46);
    });
  }

  public playBossWarning(): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const now = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const start = now + i * 0.32;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, start);
      osc.frequency.linearRampToValueAtTime(92, start + 0.28);
      gain.gain.setValueAtTime(0.09, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.29);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  }

  public playPlayerHurt(): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playDash(): void {
    const target = this.getSfxDest();
    if (!target) return;
    const { ctx, dest } = target;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.165);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.17);
  }
}

export const soundFX = new SoundController();
