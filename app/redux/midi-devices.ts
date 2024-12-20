import { createSlice } from '@reduxjs/toolkit'

export interface MidiDevicesState {
  selectedMidiDeviceId: string | null
}

export const midiDevicesSlice = createSlice({
  name: 'midiDevices',
  initialState: (): MidiDevicesState => ({
    selectedMidiDeviceId: null,
  }),
  reducers: {},
})
