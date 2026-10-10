import api = require("../api");
import "../config";
import "../runtime";
import "../rooms/state";
import "../money/ledger";
import "../timers";
import type { Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../../shared/types";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function roomFromSocket(socket: AppSocket) {
  const roomId = api.socketRoom.get(socket.id);
  return roomId ? api.rooms.get(roomId) : undefined;
}

function playerIdFromSocket(socket: AppSocket): string {
  return api.socketPlayer.get(socket.id) || socket.id;
}

function asAck(result: { ok: boolean; error?: string }): { ok: true } | { ok: false; error: string } {
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error || "Request failed." };
}



function registerSocketHandlers(): void {
  api.io.on("connection", (socket: AppSocket) => {
    socket.emit("server:hello", { buildId: api.BUILD_ID });

    socket.on(
      "room:create",
      (
        {
          name,
          deviceId,
          computerPlayers,
          tableSize,
          moneyMode,
          buyInCents,
          smallBlind,
          bigBlind,
          smallBlindCents,
          bigBlindCents,
        }: Parameters<ClientToServerEvents["room:create"]>[0],
        ack?: Parameters<ClientToServerEvents["room:create"]>[1],
      ) => {
        const playerId = api.cleanDeviceId(deviceId, socket.id);
        const cleanedBuyInCents = api.cleanMoneyCents(buyInCents, api.DEFAULT_BUY_IN_CENTS);
        let cleanSmall = api.cleanBlind(smallBlind, api.DEFAULT_SMALL_BLIND);
        let cleanBig = api.cleanBlind(bigBlind, api.DEFAULT_BIG_BLIND);
        if (moneyMode) {
          const requestedSmallCents = Math.round(Number(smallBlindCents));
          const requestedBigCents = Math.round(Number(bigBlindCents));
          if (
            !Number.isFinite(requestedSmallCents) ||
            requestedSmallCents <= 0 ||
            !Number.isFinite(requestedBigCents) ||
            requestedBigCents <= 0
          ) {
            return ack?.({ ok: false, error: "Blinds must be at least $0.01." });
          }
          cleanSmall = requestedSmallCents;
          cleanBig = requestedBigCents;
        }
        if (cleanBig <= cleanSmall)
          return ack?.({ ok: false, error: "Big blind must be greater than small blind." });
        const credentials = api.newReconnectCredentials();
        const requestedSize = moneyMode
          ? 0
          : api.cleanTableSize(tableSize) || api.cleanTableSize(computerPlayers);
        const room = api.makeRoom(playerId, api.cleanName(name || ""), socket.id, requestedSize, {
          moneyMode,
          buyInCents: cleanedBuyInCents,
          smallBlind: cleanSmall,
          bigBlind: cleanBig,
          reconnectTokenHash: credentials.tokenHash,
        });
        if (!room.moneyMode) api.addComputerPlayers(room, requestedSize || computerPlayers);
        api.markRoomLive(room.id);
        api.attachSocketToPlayer(socket, room, room.players[0]);
        ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
        api.emitRoom(room);
      },
    );

    socket.on(
      "room:join",
      async (
        {
          roomId,
          name,
          deviceId,
          reconnectToken,
          acceptedMoneyTerms,
        }: Parameters<ClientToServerEvents["room:join"]>[0],
        ack?: Parameters<ClientToServerEvents["room:join"]>[1],
      ) => {
        const room = await api.claimRoomForLiveActivity(roomId || "");
        if (!room) return ack?.({ ok: false, error: "Room not found." });
        const playerId = api.cleanDeviceId(deviceId, socket.id);
        const existing = room.players.find((player) => player.id === playerId);
        if (existing) {
          if (existing.isBot) return ack?.({ ok: false, error: "That seat is not available." });
          if (!api.reconnectTokenMatches(existing, reconnectToken)) {
            return ack?.({ ok: false, error: "This seat belongs to another session." });
          }
          // Drop any stale spectator entry for this device before seating.
          const staleSpectator = api.findSpectator(room, playerId);
          if (staleSpectator) api.removeSpectator(room, staleSpectator);
          existing.name = api.cleanName(name || "");
          api.attachSocketToPlayer(socket, room, existing);
          ack?.({ ok: true, roomId: room.id });
          api.emitRoom(room);
          return;
        }
        // Finished money sessions stay addressable by code so anyone can reopen settle-up.
        if (room.moneyMode && room.phase === "gameover") {
          ack?.({ ok: true, roomId: room.id, settlementView: true });
          socket.emit("room:update", api.serializeRoom(room, playerId));
          return;
        }
        const reservedBotSeat = room.players.find(
          (player) => player.isBot && player.replacedPlayerId === playerId,
        );
        if (reservedBotSeat) {
          const reservedIdentity = {
            reconnectTokenHash: reservedBotSeat.replacedReconnectTokenHash,
          };
          if (!api.reconnectTokenMatches(reservedIdentity, reconnectToken)) {
            return ack?.({ ok: false, error: "This reserved seat belongs to another session." });
          }
          const staleSpectator = api.findSpectator(room, playerId);
          if (staleSpectator) api.removeSpectator(room, staleSpectator);
          api.convertBotToHuman(
            socket,
            room,
            reservedBotSeat,
            playerId,
            name || "",
            reservedBotSeat.replacedReconnectTokenHash,
          );
          ack?.({ ok: true, roomId: room.id });
          api.emitRoom(room);
          return;
        }
        const botSeat = room.players.find((player) => player.isBot);
        if (botSeat) {
          if (api.isHandInProgress(room)) {
            return ack?.({
              ok: false,
              error: "This hand is in progress. Join after it ends.",
              canWatch: true,
            });
          }
          const staleSpectator = api.findSpectator(room, playerId);
          if (staleSpectator) api.removeSpectator(room, staleSpectator);
          const credentials = api.newReconnectCredentials();
          api.resetReadiness(room);
          api.convertBotToHuman(socket, room, botSeat, playerId, name || "", credentials.tokenHash);
          ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
          api.emitRoom(room);
          return;
        }
        const effectiveMax = room.tableSize || api.MAX_PLAYERS;
        if (room.players.length >= effectiveMax) {
          return ack?.({ ok: false, error: "Room is full.", canWatch: true });
        }
        if (room.phase === "gameover")
          return ack?.({ ok: false, error: "This session has ended." });
        if (!room.moneyMode && room.phase !== "lobby" && room.phase !== "complete") {
          return ack?.({
            ok: false,
            error: "This hand is in progress. Join after it ends.",
            canWatch: true,
          });
        }
        if (room.moneyMode) {
          const moneyTerms = api.moneyTermsForRoom(room);
          if (!api.moneyTermsAccepted(room, acceptedMoneyTerms)) {
            return ack?.({
              ok: false,
              moneyTerms,
              error: "Review the buy-in and blinds before joining.",
            });
          }
        }
        const staleSpectator = api.findSpectator(room, playerId);
        if (staleSpectator) api.removeSpectator(room, staleSpectator);
        const credentials = api.newReconnectCredentials();
        api.resetReadiness(room);
        room.players.push(
          api.makeHumanPlayer(room, {
            id: playerId,
            socketId: socket.id,
            name: api.cleanName(name || ""),
            reconnectTokenHash: credentials.tokenHash,
          }),
        );
        api.attachSocketToPlayer(socket, room, room.players[room.players.length - 1]);
        if (room.tableSize) api.addComputerPlayers(room, room.tableSize);
        ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
        api.emitRoom(room);
      },
    );

    socket.on("room:watch", async (
      {
        roomId,
        name,
        deviceId,
        reconnectToken,
      }: Parameters<ClientToServerEvents["room:watch"]>[0],
      ack?: Parameters<ClientToServerEvents["room:watch"]>[1],
    ) => {
      const room = await api.claimRoomForLiveActivity(roomId || "");
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      if (room.phase === "gameover") {
        return ack?.({ ok: false, error: "This session has ended." });
      }
      const spectatorId = api.cleanDeviceId(deviceId, socket.id);
      if (room.players.some((player) => player.id === spectatorId && !player.isBot)) {
        return ack?.({ ok: false, error: "Leave your seat before watching." });
      }
      const existing = api.findSpectator(room, spectatorId);
      if (existing) {
        // Spectators reconnect by deviceId; a provided token must still match when present.
        if (
          reconnectToken &&
          existing.reconnectTokenHash &&
          !api.reconnectTokenMatches(existing, reconnectToken)
        ) {
          return ack?.({ ok: false, error: "This watcher session belongs to another device." });
        }
        existing.name = api.cleanName(name || "");
        api.attachSocketToSpectator(socket, room, existing);
        ack?.({
          ok: true,
          roomId: room.id,
          playerId: spectatorId,
          spectator: true,
        });
        api.emitRoom(room);
        return;
      }
      const credentials = api.newReconnectCredentials();
      const spectator = api.makeSpectator({
        id: spectatorId,
        socketId: socket.id,
        name: name || "",
        reconnectTokenHash: credentials.tokenHash,
      });
      api.ensureSpectators(room).push(spectator);
      api.attachSocketToSpectator(socket, room, spectator);
      ack?.({
        ok: true,
        roomId: room.id,
        playerId: spectatorId,
        spectator: true,
        reconnectToken: credentials.token,
      });
      api.emitRoom(room);
    });

    socket.on(
      "room:takeSeat",
      (
        {
          name,
          deviceId,
          reconnectToken,
          acceptedMoneyTerms,
        }: Parameters<ClientToServerEvents["room:takeSeat"]>[0] = {},
        ack?: Parameters<ClientToServerEvents["room:takeSeat"]>[1],
      ) => {
        const room = roomFromSocket(socket);
        if (!room) return ack?.({ ok: false, error: "Room not found." });
        const spectatorId = api.cleanDeviceId(
          deviceId || playerIdFromSocket(socket),
          socket.id,
        );
        const spectator = api.findSpectator(room, spectatorId);
        if (!spectator) return ack?.({ ok: false, error: "You are not watching this table." });
        if (
          spectator.reconnectTokenHash &&
          reconnectToken &&
          !api.reconnectTokenMatches(spectator, reconnectToken)
        ) {
          return ack?.({ ok: false, error: "This watcher session belongs to another device." });
        }
        if (!api.canTakeSeatNow(room)) {
          return ack?.({
            ok: false,
            error: api.roomIsFull(room) ? "Room is full." : "No seat is available right now.",
            canWatch: true,
          });
        }
        if (room.moneyMode && !api.moneyTermsAccepted(room, acceptedMoneyTerms)) {
          return ack?.({
            ok: false,
            moneyTerms: api.moneyTermsForRoom(room),
            error: "Review the buy-in and blinds before joining.",
          });
        }

        const displayName = api.cleanName(name || spectator.name || "");
        api.removeSpectator(room, spectator);

        const reservedBotSeat = room.players.find(
          (player) => player.isBot && player.replacedPlayerId === spectatorId,
        );
        if (reservedBotSeat) {
          api.convertBotToHuman(
            socket,
            room,
            reservedBotSeat,
            spectatorId,
            displayName,
            reservedBotSeat.replacedReconnectTokenHash,
          );
          ack?.({ ok: true, roomId: room.id, playerId: spectatorId });
          api.emitRoom(room);
          return;
        }
        const botSeat = room.players.find((player) => player.isBot);
        if (botSeat) {
          const credentials = api.newReconnectCredentials();
          api.resetReadiness(room);
          api.convertBotToHuman(
            socket,
            room,
            botSeat,
            spectatorId,
            displayName,
            credentials.tokenHash,
          );
          ack?.({
            ok: true,
            roomId: room.id,
            playerId: spectatorId,
            reconnectToken: credentials.token,
          });
          api.emitRoom(room);
          return;
        }

        const credentials = api.newReconnectCredentials();
        api.resetReadiness(room);
        room.players.push(
          api.makeHumanPlayer(room, {
            id: spectatorId,
            socketId: socket.id,
            name: displayName,
            reconnectTokenHash: credentials.tokenHash,
          }),
        );
        api.attachSocketToPlayer(socket, room, room.players[room.players.length - 1]);
        if (room.tableSize) api.addComputerPlayers(room, room.tableSize);
        ack?.({
          ok: true,
          roomId: room.id,
          playerId: spectatorId,
          reconnectToken: credentials.token,
        });
        api.emitRoom(room);
      },
    );

    socket.on("room:kick", (
      { playerId }: Parameters<ClientToServerEvents["room:kick"]>[0],
      ack?: Parameters<ClientToServerEvents["room:kick"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const hostId = playerIdFromSocket(socket);
      if (!room || room.hostId !== hostId)
        return ack?.({ ok: false, error: "Only the host can kick players." });
      if (api.isHandInProgress(room))
        return ack?.({ ok: false, error: "Players can only be kicked between hands." });
      if (playerId === hostId) return ack?.({ ok: false, error: "Host cannot kick themselves." });
      const removed = api.kickPlayerFromRoom(room, playerId || "");
      if (!removed) return ack?.({ ok: false, error: "Player not found." });
      ack?.({ ok: true });
      if (room.players.length === 0) {
        if (room.moneyMode) {
          api.preserveSettledMoneyRoom(room);
          return;
        }
        api.clearSpectators(room);
        api.rooms.delete(room.id);
        api.scheduleSave();
        return;
      }
      api.emitRoom(room);
    });

    socket.on("room:addBot", (
      _: Parameters<ClientToServerEvents["room:addBot"]>[0],
      ack?: Parameters<ClientToServerEvents["room:addBot"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const hostId = playerIdFromSocket(socket);
      if (!room || room.hostId !== hostId)
        return ack?.({ ok: false, error: "Only the host can add CPU players." });
      if (room.moneyMode)
        return ack?.({ ok: false, error: "CPU players are unavailable in money mode." });
      if (room.handNumber > 0)
        return ack?.({ ok: false, error: "CPU players can only be added before the game begins." });
      if (room.players.length >= api.MAX_PLAYERS)
        return ack?.({ ok: false, error: "The table is full." });
      api.addComputerPlayers(room, room.players.length + 1);
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("room:makeHost", (
      { playerId }: Parameters<ClientToServerEvents["room:makeHost"]>[0],
      ack?: Parameters<ClientToServerEvents["room:makeHost"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const hostId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.transferHost(room, hostId, playerId || "");
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on("game:start", (
      _: Parameters<ClientToServerEvents["game:start"]>[0],
      ack?: Parameters<ClientToServerEvents["game:start"]>[1],
    ) => {
      ack?.({ ok: false, error: "Players must ready up before the hand starts." });
    });

    socket.on("game:next", (
      _: Parameters<ClientToServerEvents["game:next"]>[0],
      ack?: Parameters<ClientToServerEvents["game:next"]>[1],
    ) => {
      ack?.({ ok: false, error: "Players must ready up before the next hand." });
    });

    socket.on("game:sitOut", (
      { sittingOut }: Parameters<ClientToServerEvents["game:sitOut"]>[0] = {},
      ack?: Parameters<ClientToServerEvents["game:sitOut"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const player = room?.players.find((item) => item.id === playerIdFromSocket(socket));
      if (!room || !player || player.isBot || room.phase === "gameover")
        return ack?.({ ok: false, error: "Seat unavailable." });
      player.sittingOut = sittingOut === undefined ? !player.sittingOut : Boolean(sittingOut);
      player.ready = false;
      // Current cards, bets, and action remain intact; the next deal applies the break.
      room.message = player.sittingOut
        ? `${player.name} will sit out the next hand.`
        : `${player.name} is back for the next deal.`;
      api.tryStartReadyHand(room);
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("game:ready", (
      { ready }: Parameters<ClientToServerEvents["game:ready"]>[0] = {},
      ack?: Parameters<ClientToServerEvents["game:ready"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      const player = room?.players.find((item) => item.id === playerId);
      if (!room || !player || player.isBot) return ack?.({ ok: false, error: "Player not found." });
      if (!api.canReadyForHand(room))
        return ack?.({ ok: false, error: "You can ready up between hands." });
      if (player.sittingOut)
        return ack?.({ ok: false, error: "Return to the table before readying up." });
      if (player.stack <= 0) return ack?.({ ok: false, error: "Cash in before readying up." });
      player.ready = ready === undefined ? !player.ready : Boolean(ready);
      room.message = player.ready ? `${player.name} is ready.` : `${player.name} is not ready.`;
      api.tryStartReadyHand(room);
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("game:setShotClock", (
      { seconds }: Parameters<ClientToServerEvents["game:setShotClock"]>[0] = {},
      ack?: Parameters<ClientToServerEvents["game:setShotClock"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room || room.hostId !== playerId) {
        return ack?.({ ok: false, error: "Only the host can change the shot clock." });
      }
      const result = api.setRoomShotClock(room, Number(seconds));
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on("game:setReadyTimer", (
      { seconds }: Parameters<ClientToServerEvents["game:setReadyTimer"]>[0] = {},
      ack?: Parameters<ClientToServerEvents["game:setReadyTimer"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room || room.hostId !== playerId) {
        return ack?.({ ok: false, error: "Only the host can change the ready-up timer." });
      }
      const result = api.setRoomReadyTimer(room, Number(seconds));
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on(
      "game:setBlinds",
      (
        {
          smallBlind,
          bigBlind,
          smallBlindCents,
          bigBlindCents,
        }: Parameters<ClientToServerEvents["game:setBlinds"]>[0] = {},
        ack?: Parameters<ClientToServerEvents["game:setBlinds"]>[1],
      ) => {
        const room = roomFromSocket(socket);
        const playerId = playerIdFromSocket(socket);
        if (!room || room.hostId !== playerId)
          return ack?.({ ok: false, error: "Only the host can change blinds." });
        if (!api.canReadyForHand(room))
          return ack?.({ ok: false, error: "Change blinds between hands." });

        let nextSmall;
        let nextBig;
        let nextBaseSmall;
        let nextBaseBig;
        if (room.moneyMode) {
          const chipCents = api.chipValueCents(room);
          const smallCents = Math.round(Number(smallBlindCents));
          const bigCents = Math.round(Number(bigBlindCents));
          if (
            !Number.isFinite(smallCents) ||
            smallCents <= 0 ||
            smallCents % chipCents !== 0 ||
            !Number.isFinite(bigCents) ||
            bigCents <= 0 ||
            bigCents % chipCents !== 0
          ) {
            return ack?.({
              ok: false,
              error: `Blinds must be exact multiples of $${(chipCents / 100).toFixed(2)}.`,
            });
          }
          nextSmall = smallCents / chipCents;
          nextBig = bigCents / chipCents;
          nextBaseSmall = nextSmall;
          nextBaseBig = nextBig;
        } else {
          nextSmall = api.cleanBlind(smallBlind, 0);
          nextBig = api.cleanBlind(bigBlind, 0);
          const nextHand = room.phase === "complete" ? room.handNumber + 1 : 1;
          const level = api.blindLevelForHand(nextHand);
          nextBaseSmall = Math.max(
            1,
            Math.round((nextSmall * api.DEFAULT_SMALL_BLIND) / level.smallBlind),
          );
          nextBaseBig = Math.max(2, Math.round((nextBig * api.DEFAULT_BIG_BLIND) / level.bigBlind));
        }
        if (nextBig <= nextSmall)
          return ack?.({ ok: false, error: "Big blind must be greater than small blind." });
        room.baseSmallBlind = nextBaseSmall;
        room.baseBigBlind = nextBaseBig;
        api.resetReadiness(room);
        room.minRaise = nextBig;
        room.message = `Blinds updated to ${room.moneyMode ? `${((smallBlindCents || 0) / 100).toFixed(2)}/${((bigBlindCents || 0) / 100).toFixed(2)}` : `${nextSmall}/${nextBig}`}.`;
        ack?.({ ok: true });
        api.emitRoom(room);
      },
    );

    socket.on("game:end", (
      _: Parameters<ClientToServerEvents["game:end"]>[0],
      ack?: Parameters<ClientToServerEvents["game:end"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room || room.hostId !== playerId)
        return ack?.({ ok: false, error: "Only the host can end the game." });
      if (!api.canAdministerGame(room))
        return ack?.({ ok: false, error: "Finish the current hand before ending the game." });
      if (room.phase === "lobby" && !room.moneyMode)
        return ack?.({ ok: false, error: "No game is in progress." });
      api.endGame(room);
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("game:restart", (
      _: Parameters<ClientToServerEvents["game:restart"]>[0],
      ack?: Parameters<ClientToServerEvents["game:restart"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room || room.hostId !== playerId)
        return ack?.({ ok: false, error: "Only the host can restart." });
      if (room.moneyMode)
        return ack?.({ ok: false, error: "End this money session before starting a new one." });
      if (!api.canAdministerGame(room))
        return ack?.({ ok: false, error: "Finish the current hand before restarting." });
      api.restartGame(room);
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("money:cashIn", (
      { amountCents }: Parameters<ClientToServerEvents["money:cashIn"]>[0],
      ack?: Parameters<ClientToServerEvents["money:cashIn"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.cashInPlayer(room, playerId, Number(amountCents));
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on("money:cashOut", (
      _: Parameters<ClientToServerEvents["money:cashOut"]>[0],
      ack?: Parameters<ClientToServerEvents["money:cashOut"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.cashOutPlayer(room, playerId);
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on("game:showCards", (
      _: Parameters<ClientToServerEvents["game:showCards"]>[0],
      ack?: Parameters<ClientToServerEvents["game:showCards"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.showPlayerCards(room, playerId);
      if (!result.ok) return ack?.({ ok: false, error: result.error || "Could not show cards." });
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("player:setColor", (
      { color }: Parameters<ClientToServerEvents["player:setColor"]>[0],
      ack?: Parameters<ClientToServerEvents["player:setColor"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.setPlayerColor(room, playerId, color || "");
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on("player:setName", (
      { name }: Parameters<ClientToServerEvents["player:setName"]>[0],
      ack?: Parameters<ClientToServerEvents["player:setName"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.setPlayerName(room, playerId, name || "");
      if (!result.ok) return ack?.(asAck(result));
      ack?.(asAck(result));
      api.emitRoom(room);
    });

    socket.on("game:action", (
      { type, raiseTo }: Parameters<ClientToServerEvents["game:action"]>[0],
      ack?: Parameters<ClientToServerEvents["game:action"]>[1],
    ) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      if (!room) return ack?.({ ok: false, error: "Room not found." });
      const result = api.applyPlayerAction(room, playerId, { type, raiseTo });
      if (!result.ok) return ack?.({ ok: false, error: result.error || "Invalid action." });
      ack?.({ ok: true });
      api.emitRoom(room);
    });

    socket.on("room:leave", (
      _: Parameters<ClientToServerEvents["room:leave"]>[0],
      ack?: Parameters<ClientToServerEvents["room:leave"]>[1],
    ) => {
      api.leaveCurrentRoom(socket, { allowBackgroundGrace: false });
      ack?.({ ok: true });
    });

    socket.on("room:presence", ({ hidden }: Parameters<ClientToServerEvents["room:presence"]>[0] = {}) => {
      const room = roomFromSocket(socket);
      const playerId = playerIdFromSocket(socket);
      const player = room?.players.find((item) => item.id === playerId);
      if (player && !player.isBot) {
        player.backgroundedUntil = hidden ? Date.now() + api.BACKGROUND_PRESENCE_TTL_MS : null;
        return;
      }
      const spectator = room ? api.findSpectator(room, playerId) : null;
      if (!spectator) return;
      spectator.backgroundedUntil = hidden ? Date.now() + api.BACKGROUND_PRESENCE_TTL_MS : null;
    });

    socket.on("disconnect", () => {
      api.leaveCurrentRoom(socket);
    });
  });
}

Object.assign(api, { registerSocketHandlers });
export = { registerSocketHandlers };
