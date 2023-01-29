import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import useScreenSize from "use-screen-size";

// #### TODO Import SignalWire SDK
import * as SignalWire from "@signalwire/js";

// This is the address to our own custom server.
// We will interact with this server to ask for room tokens,
// which our server will obtain from SignalWire's servers.
// Find the code at https://codesandbox.io/s/lr3ti
const SERVERLOCATION = "https://lr3ti.sse.codesandbox.io";

export default function Video({
  joinDetails: roomDetails = {
    room: "signalwire",
    name: "John Doe",
    mod: true
  },
  onRoomInit = () => {},
  onRoomUpdate = () => {},
  onMemberListUpdate = () => {},
  width = 400,
  eventLogger = console.log
}) {
  let [isLoading, setIsLoading] = useState("true");
  let [setupDone, setSetupDone] = useState(false);
  let thisMemberId = useRef(null);
  let memberList = useRef([]);
  let screen = useScreenSize();

  useEffect(() => {
    if (setupDone) return;
    setup_room();
    async function setup_room() {
      setSetupDone(true);

      // TODO
      // #### 1. Get a token from our server, for the given room and username
      let token = null;
      token = await axios.post(SERVERLOCATION + "/get_token", {
        user_name: roomDetails.name,
        room_name: roomDetails.room,
        mod: roomDetails.mod
      });
      token = token.data.token;
      // #### 2. Obtain the reference to the room
      let room = null;
      room = await SignalWire.Video.createRoomObject({
        token,
        rootElementId: "temp",
        video: true
      });
      // #### 3. Connect events

      connectEvents({
        room,
        thisMemberId,
        memberList,
        onMemberListUpdate,
        onRoomUpdate,
        eventLogger
      });

      // #### 4. Join the room
      await room.join();

      // #### 5. Obtain the list of layouts and devices

      let layouts = roomDetails.mod ? (await room.getLayouts()).layouts : [];
      let cameras = await SignalWire.WebRTC.getCameraDevicesWithPermissions();
      let microphones = await SignalWire.WebRTC.getMicrophoneDevicesWithPermissions();
      let speakers = await SignalWire.WebRTC.getSpeakerDevicesWithPermissions();

      setIsLoading(false);
      onRoomInit(room, layouts, cameras, microphones, speakers);

      // #### 6. Connect device watchers
      await connectDeviceWatchers({ onRoomUpdate, eventLogger });
    }
  }, [
    roomDetails,
    eventLogger,
    onMemberListUpdate,
    onRoomInit,
    onRoomUpdate,
    setupDone
  ]);

  return (
    <div style={styles.videoContainer}>
      {isLoading && (
        <div
          style={{ ...styles.videoPlaceholder, minHeight: 0.5 * screen.height }}
        >
          Loading ...
        </div>
      )}
      <div
        id="temp"
        style={{
          width,
          minHeight: 0.5 * screen.height
        }}
      ></div>
    </div>
  );
}

const styles = {
  videoContainer: {
    position: "relative",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  videoPlaceholder: {
    position: "absolute",
    background: "rgba(0,0,0,0.5)",
    color: "#fff",
    // width,
    // minHeight: 0.5 * screen.height,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }
};

function connectEvents({
  room,
  thisMemberId,
  memberList,
  onMemberListUpdate,
  onRoomUpdate,
  eventLogger
}) {
  room.on("room.joined", async (e) => {
    thisMemberId.current = e.member_id;
    memberList.current = e.room.members;
    let thisMember = memberList.current.find((m) => m.id === e.member_id);

    onRoomUpdate({ thisMemberId: e.member_id, member: thisMember });
    onMemberListUpdate(e.room.members);
    console.log(e.room.members);
    eventLogger("You have joined the room.");
  });
  room.on("room.updated", async (e) => {
    eventLogger("Room has been updated");
  });
  room.on("member.joined", async (e) => {
    eventLogger(e.member.name + " has joined the room.");
    memberList.current.push(e.member);
    console.log(memberList.current);
    onMemberListUpdate(memberList.current);
  });
  room.on("member.updated", async (e) => {
    let updatedMember = memberList.current.find((x) => x.id === e.member.id);

    if (updatedMember === undefined) return;
    updatedMember = { ...updatedMember, ...e.member };

    let newMemberList = memberList.current.filter((x) => x.id !== e.member.id);
    newMemberList.push(updatedMember);
    memberList.current = newMemberList;

    onMemberListUpdate([...memberList.current]);
  });
  room.on("layout.changed", async (e) => {
    onRoomUpdate({ layout: e.layout.name });
  });

  room.on("member.left", async (e) => {
    let memberThatLeft = memberList.current.find((m) => m.id === e.member.id);
    let remainingMembers = memberList.current.filter(
      (m) => m.id !== e.member.id
    );

    if (memberThatLeft === undefined) return;
    eventLogger(memberThatLeft?.name + " has left the room.");

    if (thisMemberId.current === memberThatLeft?.id) {
      console.log("It is you who has left the room");
      onRoomUpdate({ left: true });
    }

    memberList.current = remainingMembers;
    onMemberListUpdate(memberList.current);
    console.log(memberList.current);
  });
}

async function connectDeviceWatchers({ onRoomUpdate, eventLogger }) {
  let camChangeWatcher = await SignalWire.WebRTC.createDeviceWatcher({
    targets: ["camera"]
  });
  camChangeWatcher.on("changed", (changes) => {
    eventLogger("The list of camera devices has changed");
    onRoomUpdate({ cameras: changes.devices });
  });
  let micChangeWatcher = await SignalWire.WebRTC.createDeviceWatcher({
    targets: ["microphone"]
  });
  micChangeWatcher.on("changed", (changes) => {
    eventLogger("The list of microphone devices has changed");
    onRoomUpdate({ microphones: changes.devices });
  });
  let speakerChangeWatcher = await SignalWire.WebRTC.createDeviceWatcher({
    targets: ["speaker"]
  });
  speakerChangeWatcher.on("changed", (changes) => {
    eventLogger("The list of speakers has changed");
    onRoomUpdate({ speakers: changes.devices });
  });
}
