/**
 * Ambient browser / classic-script globals for public/*.ts.
 * Classic app-boot / app-table / app-events stay non-module scripts (no import/export).
 */

export {};

declare global {
  // ClientRoom / ClientPlayer / MoneyTerms are client-facing; PublicCard and
  // ActionLogEntry are already global via shared/engine.ts script aliases.
  type ClientRoom = import("../shared/types").ClientRoom;
  type ClientPlayer = import("../shared/types").ClientPlayer;
  type ClientWinnerSummary = import("../shared/types").ClientWinnerSummary;
  type MoneyTerms = import("../shared/types").MoneyTerms;
  type PublicCard = import("../shared/types").PublicCard;
  type ActionLogEntry = import("../shared/types").ActionLogEntry;
  type OkAck = import("../shared/types").OkAck;
  type ErrAck = import("../shared/types").ErrAck;
  type RoomCreateAck = import("../shared/types").RoomCreateAck;
  type RoomJoinAck = import("../shared/types").RoomJoinAck;
  type RoomWatchAck = import("../shared/types").RoomWatchAck;
  type RoomTakeSeatAck = import("../shared/types").RoomTakeSeatAck;

  /** Socket.IO timeout() ack: first arg is timeout/transport error, second is server ack. */
  type SocketTimeoutAck<T> = (error: Error | null, response?: T) => void;

  /**
   * Bivariant listener slot so call sites can narrow event payloads.
   * Strict function types would otherwise reject `(room: ClientRoom) => void`
   * against `(...args: unknown[]) => void`.
   */
  type SocketHandler = { bivarianceHack(...args: unknown[]): void }["bivarianceHack"];

  // —— Socket.IO browser build (script tag) ——
  interface SocketLike {
    connected: boolean;
    id?: string;
    on(event: string, handler: SocketHandler): SocketLike;
    once(event: string, handler: SocketHandler): SocketLike;
    off(event: string, handler?: SocketHandler): SocketLike;
    emit(event: string, ...args: unknown[]): SocketLike;
    timeout(ms: number): SocketLike;
    disconnect(): SocketLike;
    connect(): SocketLike;
    io?: { on(event: string, handler: SocketHandler): unknown };
  }

  interface IoOptions {
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
  }

  function io(options?: IoOptions): SocketLike;
  function io(url: string, options?: IoOptions): SocketLike;

  // —— Shared engine (UMD) ——
  interface HoldemEngineAPI {
    STARTING_STACK: number;
    MAX_PLAYERS: number;
    createPracticeRoom(options?: Record<string, unknown>): PracticeRoom;
    serializeRoom(room: PracticeRoom, viewerId: string): ClientRoom;
    hydratePracticeRoomFromSnapshot(snapshot: ClientRoom): PracticeRoom;
    restartPracticeRoom(room: PracticeRoom): void;
    endPracticeGame(room: PracticeRoom): void;
    isSoloHumanFolded(room: PracticeRoom): boolean;
    settleShowdown(room: PracticeRoom): void;
    isHandInProgress(room: PracticeRoom): boolean;
    applyPlayerAction(
      room: PracticeRoom,
      playerId: string,
      action: Record<string, unknown>,
    ): { ok: boolean; error?: string };
    chooseComputerAction(
      room: PracticeRoom,
      player: PracticeSeat,
    ): { type: string; raiseTo?: number };
    computerThinkDelayMs(
      room: PracticeRoom,
      player: PracticeSeat,
      action: { type: string; raiseTo?: number },
    ): number;
    rebuyBustedPlayer(room: PracticeRoom, playerId: string): { ok: boolean; error?: string };
    canReadyForHand(room: PracticeRoom): boolean;
    maybeStartReadyHand(room: PracticeRoom): void;
    showPlayerCards(room: PracticeRoom, playerId: string): { ok: boolean; error?: string };
    visibleRabbitCards(room: PracticeRoom): string[];
    revealRabbitHunt(room: PracticeRoom, playerId: string): { ok: boolean; error?: string };
    setRabbitHunt(room: PracticeRoom, enabled: boolean): void;
    addComputerPlayers(room: PracticeRoom, targetCount: number): void;
    resetReadiness(room: PracticeRoom): void;
    cleanName(name: unknown): string;
  }

  interface PracticeSeat {
    id: string;
    name: string;
    isBot?: boolean;
    ready?: boolean;
    sittingOut?: boolean;
    stack?: number;
    [key: string]: unknown;
  }

  interface PracticeRoom {
    hostId: string;
    phase: string;
    turn: string | null;
    players: PracticeSeat[];
    handNumber: number;
    tableSize: number;
    message: string;
    startingStack?: number;
    baseSmallBlind?: number;
    baseBigBlind?: number;
    minRaise?: number;
    showdownTimer?: ReturnType<typeof setTimeout> | null;
    botTimer?: ReturnType<typeof setTimeout> | null;
    botTimerKey?: string | null;
    actionLog: unknown[];
    currentBet: number;
    [key: string]: unknown;
  }

  const HoldemEngine: HoldemEngineAPI;

  // —— UMD client modules ——
  interface PracticeSessionHandle {
    offline: true;
    viewerId: string;
    getRoom(): PracticeRoom;
    snapshot(): ClientRoom;
    publish(): void;
    handle(eventName: string, payload?: Record<string, unknown>): { ok: boolean; error?: string };
    dispose(): void;
    setOnUpdate(fn: ((room: ClientRoom) => void) | null): void;
  }

  interface PracticeSessionAPI {
    canHandoffToOffline(state: ClientRoom | null | undefined): boolean;
    createPracticeSession(options?: Record<string, unknown>): PracticeSessionHandle;
    createPracticeSessionFromSnapshot(
      snapshot: ClientRoom,
      options?: Record<string, unknown>,
    ): PracticeSessionHandle;
  }

  const PracticeSession: PracticeSessionAPI;

  interface DeployHandoffAPI {
    ACTIVE_HAND_PHASES: Set<string>;
    isActiveHandPhase(phase: unknown): boolean;
    shouldReloadForNewBuild(options?: {
      clientBuildId?: string | null;
      serverBuildId?: string | null;
      phase?: string | null;
    }): boolean;
  }

  const DeployHandoff: DeployHandoffAPI;

  interface RaiseBoundsInput {
    minRaiseTo?: number;
    maxRaiseTo?: number;
    step?: number;
    currentBet?: number;
    mergeCheckBet?: boolean;
    mergeCallRaise?: boolean;
    hardDetent?: boolean;
  }

  interface RaiseSizingAPI {
    legalRaiseTo(rawValue: unknown, bounds?: RaiseBoundsInput): number;
    potPresetRaiseTo(options: {
      pot: unknown;
      currentBet: unknown;
      bigBlind: unknown;
      fraction: unknown;
      toCall?: unknown;
    }): number;
    passiveDetentValue(currentBet: unknown): number;
    isPassiveDetent(value: unknown, currentBet: unknown): boolean;
    checkDetentValue(currentBet: unknown): number;
    isCheckDetent(value: unknown, currentBet: unknown): boolean;
    callDetentValue(currentBet: unknown): number;
    isCallDetent(value: unknown, currentBet: unknown): boolean;
    usesPassiveDetent(flags?: {
      mergeCheckBet?: boolean;
      mergeCallRaise?: boolean;
      hardDetent?: boolean;
    }): boolean;
    clampRaiseTo(rawValue: unknown, bounds?: RaiseBoundsInput): number;
    nudgeRaiseTo(rawValue: unknown, direction: number, bounds?: RaiseBoundsInput): number;
  }

  const RaiseSizing: RaiseSizingAPI;

  interface CardArtAPI {
    layouts: Record<string, number[][]>;
    render(rank: string, suit: string): string;
  }

  var CardArt: CardArtAPI;

  interface LowTimeSession {
    turnEndsAt: number | null;
    lastSeenTickSecond: number | null;
    armed: boolean;
    sawActive: boolean;
    timeoutConsumed: boolean;
  }

  interface TurnClockWarningAPI {
    LOW_TIME_MS: number;
    remainingMs(turnEndsAt: unknown, now: unknown): number;
    isLowTime(turnEndsAt: unknown, now: unknown, thresholdMs?: number): boolean;
    lowTimeTickSecond(turnEndsAt: unknown, now: unknown, thresholdMs?: number): number | null;
    createLowTimeSession(): LowTimeSession;
    resetLowTimeSession(session: LowTimeSession | null | undefined): void;
    consumeLowTimeTick(
      session: LowTimeSession | null | undefined,
      options?: { turnEndsAt?: unknown; now?: unknown; thresholdMs?: number },
    ): number | null;
    consumeDeadlineTimeout(
      session: LowTimeSession | null | undefined,
      options?: { turnEndsAt?: unknown; now?: unknown },
    ): boolean;
  }

  const TurnClockWarning: TurnClockWarningAPI;

  interface ReadyClockAPI {
    readyPhaseActive(phase: unknown): boolean;
    seatShowsReadyClock(
      player: ClientPlayer | null | undefined,
      options?: { readyEndsAt?: unknown; phase?: unknown },
    ): boolean;
    readySecondsRemaining(readyEndsAt: unknown, now: unknown): number;
    readyPctRemaining(readyEndsAt: unknown, readyTimeLimitMs: unknown, now: unknown): number;
  }

  const ReadyClock: ReadyClockAPI;

  interface InviteLocationLike {
    hostname?: string;
    origin?: string;
    pathname?: string;
  }

  interface InviteUrlAPI {
    CANONICAL_ORIGIN: string;
    isProductionInviteHost(hostname: unknown): boolean;
    canonicalInviteUrl(roomId: unknown, locationLike?: InviteLocationLike | string): string;
  }

  const InviteUrl: InviteUrlAPI;

  interface TableSounds {
    context: AudioContext | null;
    master: GainNode | null;
    noiseBuffer: AudioBuffer | null;
    enabled: boolean;
    unlock(): AudioContext | null;
    createNoiseBuffer(): AudioBuffer;
    setEnabled(enabled: boolean): void;
    output(gainValue: number, pan?: number): GainNode;
    paper(at?: number, pan?: number): void;
    tap(at?: number, frequency?: number, volume?: number, pan?: number): void;
    click(): void;
    buttonTap(primary?: boolean): void;
    chips(kind?: string): void;
    deal(count?: number): void;
    turn(): void;
    win(): void;
    shotClockTick(secondsLeft?: number): void;
    tickVoice(start: number, frequency: number, peak: number): void;
    timerTimeout(): void;
  }

  interface TableSoundsConstructor {
    new (): TableSounds;
  }

  const TableSounds: TableSoundsConstructor;

  interface HoldemFormatAPI {
    escapeHtml(value: unknown): string;
    escapeRegExp(value: unknown): string;
    moneyCentsFromInput(input: HTMLInputElement, fallback?: number): number;
    formatMoney(cents: unknown): string;
    formatSignedMoney(cents: unknown): string;
    formatAmount(chips: unknown, cents: unknown): string;
    playerStackLabel(player: ClientPlayer): string;
    cardTemplate(card: PublicCard | null | undefined | false, extraClass?: string): string;
    playerColorStyle(player: ClientPlayer | null | undefined): string;
  }

  const HoldemFormat: HoldemFormatAPI;

  interface KeybindDefinition {
    id: string;
    label: string;
    defaultKey: string;
    defaultAliases?: string[];
  }

  type KeybindMap = Record<string, string>;
  type KeybindAliasMap = Record<string, string[]>;

  interface HoldemKeybindsAPI {
    KEYBIND_DEFINITIONS: KeybindDefinition[];
    DEFAULT_KEYBINDS: KeybindMap;
    DEFAULT_KEYBIND_ALIASES: KeybindAliasMap;
    normalizedKey(key: string | undefined): string | undefined;
    loadKeybinds(): KeybindMap;
    keybindLabel(key: string | undefined): string | undefined;
    activeKeybindAliases(keybinds: KeybindMap, action: string): string[];
    keysForAction(keybinds: KeybindMap, action: string): string[];
    keybindDisplay(keybinds: KeybindMap, action: string): string;
    saveKeybinds(keybinds: KeybindMap): void;
    matchesKeybind(event: KeyboardEvent, keybinds: KeybindMap, action: string): boolean;
    assignKeybindState(
      keybinds: KeybindMap,
      action: string,
      key: string,
    ): { keybinds: KeybindMap; conflictAction: string | null };
  }

  const HoldemKeybinds: HoldemKeybindsAPI;

  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  // Allow UMD factories to assign onto globalThis without index-signature errors.
  interface GlobalThis {
    PracticeSession?: PracticeSessionAPI;
    DeployHandoff?: DeployHandoffAPI;
    RaiseSizing?: RaiseSizingAPI;
    CardArt?: CardArtAPI;
    TurnClockWarning?: TurnClockWarningAPI;
    ReadyClock?: ReadyClockAPI;
    InviteUrl?: InviteUrlAPI;
    TableSounds?: TableSoundsConstructor;
    HoldemFormat?: HoldemFormatAPI;
    HoldemKeybinds?: HoldemKeybindsAPI;
    HoldemEngine?: HoldemEngineAPI;
    state?: ClientRoom | null;
  }

  // —— Classic multi-file script shared bindings (app-boot / app-table / app-events) ——
  interface TimerChoice {
    seconds: number;
    label: string;
  }

  interface AppearanceOption {
    id: string;
    label: string;
    color?: string;
    description?: string;
    rank?: string;
    suit?: string;
  }

  interface RaiseState {
    value: number;
    min: number;
    max: number;
    step: number;
  }

  interface RoomCredential {
    playerId?: string;
    reconnectToken?: string | null;
    spectator?: boolean;
  }

  interface ActionFeedScrollSnapshot {
    stickToBottom?: boolean;
    followBottom?: boolean;
    top?: number;
  }

  var socket: SocketLike | null;
  var welcome: HTMLElement;
  var themeColor: HTMLMetaElement | null;
  var tableView: HTMLElement;
  var scoreView: HTMLElement;
  var joinForm: HTMLFormElement;
  var nameInput: HTMLInputElement;
  var roomInput: HTMLInputElement;
  var roomCodeLabel: HTMLElement;
  var hostModeBtn: HTMLButtonElement;
  var joinModeBtn: HTMLButtonElement;
  var moneyModeLabel: HTMLElement | null;
  var blindFields: HTMLElement | null;
  var smallBlindInput: HTMLInputElement;
  var bigBlindInput: HTMLInputElement;
  var smallBlindLabel: HTMLElement;
  var bigBlindLabel: HTMLElement;
  var moneyModeInput: HTMLInputElement;
  var buyInLabel: HTMLElement;
  var buyInInput: HTMLInputElement;
  var tableActionBtn: HTMLButtonElement;
  var watchBtn: HTMLButtonElement | null;
  var joinError: HTMLElement;
  var roomCode: HTMLElement;
  var roomCodeBtn: HTMLButtonElement;
  var watchingCountEl: HTMLElement | null;
  var menuBtn: HTMLButtonElement;
  var gameMenuModal: HTMLElement;
  var closeMenuBtn: HTMLButtonElement;
  var menuMainView: HTMLElement;
  var menuSettingsView: HTMLElement;
  var openSettingsBtn: HTMLButtonElement;
  var closeSettingsBtn: HTMLButtonElement;
  var closeSettingsMenuBtn: HTMLButtonElement;
  var settingsTableSection: HTMLElement;
  var addBotBtn: HTMLButtonElement;
  var restartGameBtn: HTMLButtonElement;
  var endGameBtn: HTMLButtonElement;
  var shareGameBtn: HTMLButtonElement;
  var backToMenuBtn: HTMLButtonElement;
  var sitOutBtn: HTMLButtonElement;
  var hostActionsPanel: HTMLElement;
  var menuRoomCode: HTMLElement;
  var menuRoomEyebrow: HTMLElement | null;
  var menuNameForm: HTMLFormElement;
  var menuPlayers: HTMLElement;
  var openPlayerSheetId: string;
  var copyIconResetTimer: ReturnType<typeof setTimeout> | null;
  var soundEnabledInput: HTMLInputElement;
  var wideTableInput: HTMLInputElement | null;
  var WIDE_TABLE_KEY: string;
  function wideTableEnabled(): boolean;
  function applyWideTable(enabled: boolean): void;
  function setWideTable(enabled: boolean): void;
  var sharePanel: HTMLElement;
  var shareQr: HTMLImageElement;
  var shareLink: HTMLInputElement;
  var copyShareBtn: HTMLButtonElement;
  var moneyPanel: HTMLElement;
  var moneyDetails: HTMLElement;
  var blindPanel: HTMLElement;
  var blindForm: HTMLFormElement;
  var menuSmallBlindLabel: HTMLElement;
  var menuBigBlindLabel: HTMLElement;
  var menuSmallBlindInput: HTMLInputElement;
  var menuBigBlindInput: HTMLInputElement;
  var shotClockPanel: HTMLElement;
  var shotClockChoices: HTMLElement;
  var readyTimerPanel: HTMLElement;
  var rabbitHuntPanel: HTMLElement;
  var rabbitHuntChoices: HTMLElement;
  var readyTimerChoices: HTMLElement;
  var SHOT_CLOCK_CHOICES: TimerChoice[];
  var READY_TIMER_CHOICES: TimerChoice[];
  var serverTimeOffsetMs: number;
  var cashInInput: HTMLInputElement;
  var cashInBtn: HTMLButtonElement;
  var cashOutBtn: HTMLButtonElement;
  var moneyNote: HTMLElement | null;
  var potValue: HTMLElement;
  var community: HTMLElement;
  var players: HTMLElement;
  var heroHand: HTMLElement;
  var winnerList: HTMLElement;
  var turnInfo: HTMLElement;
  var gameButtons: HTMLElement;
  var betControls: HTMLElement;
  var raiseMinus: HTMLButtonElement;
  var raisePlus: HTMLButtonElement;
  var raiseLabel: HTMLElement;
  var raiseAmount: HTMLElement;
  var raiseActionBtn: HTMLButtonElement;
  var betPresets: HTMLElement;
  var scoreList: HTMLElement;
  var scoreMenuBtn: HTMLButtonElement;
  var toast: HTMLElement;
  var reconnectBanner: HTMLElement;
  var Deploy: DeployHandoffAPI | null;
  var knownBuildId: string | null;
  var pendingServerBuildId: string | null;
  var expectingServerRestart: boolean;
  var reconnectBannerVisible: boolean;
  var tableSounds: TableSounds;
  var escapeHtml: HoldemFormatAPI["escapeHtml"];
  var escapeRegExp: HoldemFormatAPI["escapeRegExp"];
  var moneyCentsFromInput: HoldemFormatAPI["moneyCentsFromInput"];
  var formatMoney: HoldemFormatAPI["formatMoney"];
  var formatSignedMoney: HoldemFormatAPI["formatSignedMoney"];
  var formatAmount: HoldemFormatAPI["formatAmount"];
  var playerStackLabel: HoldemFormatAPI["playerStackLabel"];
  var cardTemplate: HoldemFormatAPI["cardTemplate"];
  var playerColorStyle: HoldemFormatAPI["playerColorStyle"];
  var keybinds: KeybindMap;
  var state: ClientRoom | null;
  var practiceSession: PracticeSessionHandle | null;
  var turnCountdownTimer: ReturnType<typeof setInterval> | null;
  var readyCountdownTimer: ReturnType<typeof setInterval> | null;
  var lowTimeSession: LowTimeSession;
  var readyLowTimeSession: LowTimeSession;
  var lowTimeVibratedForEndsAt: number | null;
  var shotClockCueEligibleForEndsAt: number | null;
  var readyCueEligibleForEndsAt: number | null;
  var raiseState: RaiseState;
  var raiseControlsDisabled: boolean;
  var mergePassiveConfirm: boolean;
  var confirmActionBtn: HTMLButtonElement | null;
  var leavingEndedRoom: boolean;
  var menuTimer: ReturnType<typeof setInterval> | null;
  var lastAutoRejoinKey: string;
  var lastActionEntryId: string;
  var lastCommunitySignature: string | null;
  var lastHeroSignature: string;
  var heroCardsHidden: boolean;
  var lastWinnerSignature: string;
  var lastPhase: string;
  var lastPot: number | null;
  var params: URLSearchParams;
  var initialRoomParam: string;
  var initialRoomId: string;
  var joinPending: boolean;
  var watchOfferPending: boolean;
  var acceptedMoneyTerms: MoneyTerms | null;
  var joinPreview: HTMLElement;
  var didAutoJoinInitialRoom: boolean;
  var tableMode: string;
  var toastTimer: ReturnType<typeof setTimeout> | null;
  var FELT_OPTIONS: AppearanceOption[];
  var DECK_OPTIONS: AppearanceOption[];
  var deviceTheme: MediaQueryList;
  var previousGameTouchY: number | null;

  function keybindLabel(key: string | undefined): string | undefined;
  function activeKeybindAliases(action: string): string[];
  function keysForAction(action: string): string[];
  function keybindDisplay(action: string): string;
  function matchesKeybind(event: KeyboardEvent, action: string): boolean;
  function formatTimerChoiceLabel(seconds: number): string;
  function timerChoicesForValue(presets: TimerChoice[], selectedSeconds: number): TimerChoice[];
  function applyTheme(theme: string): void;
  function applyTableAppearance(felt: string | null, deck: string | null, persist?: boolean): void;
  function getDeviceId(): string;
  function roomCredentials(roomId: string): RoomCredential | null;
  function saveRoomCredentials(
    roomId: string,
    response: {
      playerId?: string;
      reconnectToken?: string;
      spectator?: boolean;
    },
  ): void;
  function setViewportHeight(): void;
  function setKeyboardMode(isOpen: boolean): void;
  function lockMobileGameOverscroll(event: TouchEvent): void;
  function isOfflineSession(): boolean;
  function disposePracticeSession(): void;
  function hostUsesOfflinePath(): boolean;
  function handoffOnlineToOffline(): boolean;
  function applyRoomUpdate(room: ClientRoom): void;
  function updateTableActionLabel(): void;
  function syncBlindInputMode(): void;
  function setTableMode(mode: string, focusRoom?: boolean): void;
  function isSpectatorView(room?: ClientRoom | null): boolean;
  function showToast(message: string): void;
  function setReconnectBanner(visible: boolean, message?: string): void;
  function noteServerBuildId(buildId: string | null | undefined, phase?: string | null): void;
  function maybeReloadForPendingBuild(phase?: string | null): void;
  function updateHeroCardVisibility(): void;
  function showTable(room: ClientRoom): void;
  function showMenuMainView(): void;
  function showMenuSettingsView(): void;
  function hideGameMenu(): void;
  function syncMenuNameForm(): void;
  function renderControlsContent(hero: ClientPlayer | null | undefined): void;
  function setBetControlsReserved(reserved: boolean): void;
  function actionPlaceholder(label: string): HTMLButtonElement;
  function reserveActionSpace(): void;
  function winnerHowText(hand: string | null | undefined): string;
  function syncHostMenuSection(): void;
  function syncBlindPanel(canBlinds: boolean): void;
  function playerIsOut(player: ClientPlayer): boolean;
  function seatedPlayers(list?: ClientPlayer[] | null): ClientPlayer[];
  function roundStatus(player: ClientPlayer): string;
  function isMenuNameEditing(): boolean;
  function syncServerTimeOffset(nextState: ClientRoom | null | undefined): void;
  function clientNow(): number;
  function formatTurnCountdown(seconds: number): string;
  function commitMenuDisplayName(nameForm: HTMLElement | null): void;
  function renderMenuPlayers(): void;
  function heroCanCashIn(): boolean;
  function syncCashInControls(): void;
  function showGameMenu(): void;
  function showWelcome(status?: string): void;
  function showScoreScreen(room: ClientRoom): void;
  function replayAnimation(
    element: Element | null | undefined,
    className: string,
    duration?: number,
  ): void;
  function setRoomUrl(roomId: string): void;
  function inviteUrl(): string;
  function canonicalInviteUrl(roomId: string): string;
  function clearRoomUrl(): void;
  function findLastIndex<T>(items: T[], predicate: (item: T, index: number) => boolean): number;
  function activeHero(): ClientPlayer | null | undefined;
  function compactPlayerAction(entry: ActionLogEntry, player: ClientPlayer | null | undefined): string;
  function isBlindPost(entry: ActionLogEntry): boolean;
  function actionTokenClass(entry: ActionLogEntry, player: ClientPlayer | null | undefined): string;
  function playerTableStatus(player: ClientPlayer, isActiveTurn?: boolean): string;
  function playerForAction(entry: ActionLogEntry): ClientPlayer | null | undefined;
  function renderShownHandCard(player: ClientPlayer): string;
  function currentTurnPlayer(): ClientPlayer | null | undefined;
  function isBettingPhase(phase: string | null | undefined): boolean;
  function streetActionEntries(
    actionLog: ActionLogEntry[] | null | undefined,
    phase: string | null | undefined,
  ): ActionLogEntry[];
  function renderShotClockChoices(): void;
  function renderReadyTimerChoices(): void;
  function renderRabbitHuntChoices(): void;
  function rabbitFaceDownTemplate(withHint: boolean): string;
  function revealRabbitBoard(): void;
  function turnSecondsRemaining(): number;
  function turnPctRemaining(): number;
  function actingSeatShowsClock(player: ClientPlayer): boolean;
  function lowTimeWarningActive(): boolean;
  function canHearShotClockCues(): boolean;
  function playTimerTimeoutIfEligible(
    eligibleForEndsAt: number | null,
    endsAt: number | null | undefined,
  ): void;
  function syncLowTimeWarningEffects(now?: number): void;
  function syncTurnCountdown(): void;
  function botStyleTagMarkup(player: ClientPlayer): string;
  function renderBustPanel(room: ClientRoom): void;
  function blindChipMarkup(player: ClientPlayer): string;
  function readyTimerActive(): boolean;
  function readySecondsRemaining(): number;
  function readyPctRemaining(): number;
  function seatShowsReadyClock(player: ClientPlayer): boolean;
  function readyLowTimeWarningActive(): boolean;
  function canHearReadyClockCues(): boolean;
  function syncReadyLowTimeWarningEffects(now?: number): void;
  function syncReadyCountdown(): void;
  function renderActionFeed(newEntryId?: string): string;
  function isEndedGameReturn(
    previous: ClientRoom | null | undefined,
    next: ClientRoom | null | undefined,
  ): boolean;
  function isGameOver(room: ClientRoom | null | undefined): boolean;
  function playActionSound(entry: ActionLogEntry | null | undefined): void;
  function render(): void;
  function captureActionFeedScroll(): ActionFeedScrollSnapshot | null;
  function restoreActionFeedScroll(snapshot: ActionFeedScrollSnapshot | null): void;
  function scrollActionFeed(): void;
  function renderControls(hero: ClientPlayer | null | undefined): void;
  function renderHeroActionControls(hero: ClientPlayer, disabled: boolean): void;
  function configureRaiseControls(hero: ClientPlayer, disabled?: boolean): void;
  function raiseBounds(): { min: number; max: number; step: number; currentBet: number };
  function atPassiveDetent(): boolean;
  function renderBetPresets(hero: ClientPlayer, disabled: boolean, canFullRaise?: boolean): void;
  function setRaiseState(next: Partial<RaiseState> | RaiseState): void;
  function clampRaise(value: unknown): number;
  function changeRaise(direction: number): void;
  function setButtonLabel(
    button: HTMLElement | null | undefined,
    label: string,
    shortcut?: string,
  ): void;
  function addConfirmPassiveButton(disabled?: boolean): void;
  function updateConfirmPassiveButton(): void;
  function addButton(
    label: string,
    eventName: string,
    className?: string,
    shortcut?: string,
    payload?: Record<string, unknown>,
  ): HTMLButtonElement;
  function addActionButton(
    label: string,
    payload: Record<string, unknown>,
    className?: string,
    disabled?: boolean,
  ): HTMLButtonElement;
  function makeHost(playerId: string | undefined): void;
  function kickPlayer(playerId: string | undefined): void;
  function showSharePanel(): void;
  function emitWithAck(
    eventName: string,
    payload?: Record<string, unknown>,
  ): void;
  function startOfflineHost(): void;
  function joinOrCreate(mode: string): void;
  function watchRoom(): void;
  function takeSeatFromSpectator(): void;
  function attemptAutoRejoin(): void;
  function autoJoinInitialRoom(): void;
  function reportVisibility(): void;
  function flashCopyIcon(root?: HTMLElement | null): void;
  function copyText(text: string, button: HTMLElement): Promise<void>;
}
