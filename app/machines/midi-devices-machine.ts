import * as v from 'valibot'
import {
  assign,
  type EventObject,
  fromCallback,
  fromPromise,
  setup,
  stopChild,
} from 'xstate'

const MidiMessage = {
  NOTE_ON: 144,
  NOTE_OFF: 128,
} as const

const NoteOn = v.pipe(
  v.strictTuple([v.literal(MidiMessage.NOTE_ON), v.number(), v.number()]),
  v.transform(([_, key, velocity]) => ({
    type: 'note-on' as const,
    key,
    velocity,
  }))
)

const NoteOff = v.pipe(
  v.strictTuple([v.literal(MidiMessage.NOTE_OFF), v.number(), v.number()]),
  v.transform(([_, key, velocity]) => ({
    type: 'note-off' as const,
    key,
    velocity,
  }))
)

const isMidiConnectionEvent = (event: Event): event is MIDIConnectionEvent =>
  'port' in event

export const midiAccessMachine = setup({
  types: {
    context: {} as {
      midiAccess: MIDIAccess
      selectedMidiDeviceId: string | null
    },
    input: {} as {
      midiAccess: MIDIAccess
    },
    events: {} as
      | {
          type: 'select-midi-device'
          id: string
        }
      | { type: 'deselect-midi-device' }
      | {
          type: 'midi-port-connected'
          port: MIDIPort
        }
      | {
          type: 'midi-port-disconnected'
          port: MIDIPort
        },
  },
  actors: {
    listen: fromCallback<
      EventObject,
      { midiAccess: MIDIAccess },
      | { type: 'midi-port-connected'; port: MIDIPort }
      | { type: 'midi-port-disconnected'; port: MIDIPort }
    >(({ input, emit }) => {
      const statechangeHandler = (event: Event) => {
        if (isMidiConnectionEvent(event)) {
          if (!event.port) {
            return
          }

          switch (event.port.state) {
            case 'connected':
              emit({ type: 'midi-port-connected', port: event.port })
              break
            case 'disconnected':
              emit({ type: 'midi-port-disconnected', port: event.port })
              break
          }
        }
      }

      input.midiAccess.addEventListener('statechange', statechangeHandler)

      input.midiAccess.inputs.forEach((input) => {
        if (input.manufacturer === 'Focusrite') {
          input.open().then(() => {
            input.addEventListener('midimessage', (event) => {
              if (!event.data) return
              const status = event.data.at(0)
              switch (status) {
                case MidiMessage.NOTE_ON:
                  console.log(v.parse(NoteOn, Array.from(event.data)))
                  break
                case MidiMessage.NOTE_OFF:
                  console.log(v.parse(NoteOff, Array.from(event.data)))
                  break
                default:
                  console.log('unknown', event.data)
              }
            })
          })
        }
      })

      const removeListeners = () => {
        input.midiAccess.removeEventListener('statechange', statechangeHandler)
      }

      return () => {
        console.log('midi-access unsubscribe')
        removeListeners()
      }
    }),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCWFUFoCGBjXcsAxLGADZi4AumaGmEYAbqgQNoAMAuoqAA4B7WKiqoBAO14gAHogDMHAHQA2OcoDsARgAc6gKwAaEAE9EAJg4BORQBY9czVfU3NZx5ZsBfT0bpY8BLDEjKQU1LToWIws7NxSgsKiElKyCG62yjbaNnL6RqYImppy3r6ROPiERH6YggBONLgS4pRUkJw8SCAJImKSXalmZorqlsq6hiaIysN6pSA1AVU19TQYsE3iLdTtcV09Sf2gqa75iK7ePiDiAiFSi5VB8UK9yQPmwxw2ZmMTZ2mWYaWDgzTQebRmb5g+YPQKwRRkVCwNriVDiKDPRJ9FKIdRKL4-cZ5KYIb7qWwgtzgyFUy6eIA */
  id: 'midi-access',
  context: ({ input }) => ({
    midiAccess: input.midiAccess,
    selectedMidiDeviceId: null,
  }),
  initial: 'listening',
  on: {
    'select-midi-device': {
      actions: assign({
        selectedMidiDeviceId: ({ event }) => event.id,
      }),
    },
    'deselect-midi-device': {
      actions: assign({
        selectedMidiDeviceId: null,
      }),
    },
    'midi-port-connected': {},
    'midi-port-disconnected': {},
  },
  invoke: {
    id: 'listen',
    src: 'listen',
    input: ({ context }) => ({ midiAccess: context.midiAccess }),
  },
  states: {
    listening: {},
  },
})

export const midiDevicesMachine = setup({
  types: {
    context: {} as {
      midiAccess: MIDIAccess | undefined
    },
  },
  actors: {
    'obtain-midi-access': fromPromise(async (): Promise<MIDIAccess> => {
      const permissionStatus = await navigator.permissions.query({
        name: 'midi',
        sysex: true,
        software: true,
      })
      switch (permissionStatus.state) {
        case 'granted':
        case 'prompt':
          return navigator.requestMIDIAccess({ sysex: true, software: true })
        case 'denied':
          throw new Error('Permission denied')
      }
    }),
    'midi-access': midiAccessMachine,
  },
  actions: {
    stop: () => {
      console.log('stop()')
    },
  },
  guards: {},
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCWFUFoJgG6oGM4BiWAFwHsAHAbQAYBdRUKi2VM1CgO2ZAA9EAZgAcARgB0QgEx0ZdAOwBWaSIAsahWoA0IAJ6Ix0gL7HdaDNjyE4EgDYUAhhm5RiEHmAmpuuCgGsvCywcfCJYeycXKAQfPwJHTh56BhS+VnYk3iQBRGkATgUJLWkxBTo6MQA2MTpNXQMEMRFpCU0qpSr8kUU1IW7Tc3QQ63DI5x83MAAnaYppiSo7RIAzeeQJYKsw2wcJ11jfCgSslLScjI4ubNBBBAKikrKK6tr6-TyRIrUlISM6cQKIQKMT5NSmMwgbgUHDwHJbUI2OEsNhXHh8O6YMQNRD5IRtX5vKoKfLSTT5KqDEAI0a7KKTdKorIYxDvRqgpQSWR-P4iIRVNRiNR0SmQmk7CJ7HAQRmZa4shAqKoEv5iMoC1QiJQ4po9CT5QkyIRyCrgsXDbZIiQzObTWVom65RXSZU-VXqtSa7Ufe4iV2EgpKORqAXAiHGIA */
  id: 'midi-devices',
  context: {
    midiAccess: undefined,
  },
  initial: 'loading',
  on: {
    stop: {
      actions: stopChild('midi-access'),
    },
  },
  states: {
    loading: {
      invoke: {
        src: 'obtain-midi-access',
        onDone: {
          target: 'loaded',
          actions: assign({
            midiAccess: ({ event }) => event.output,
          }),
        },
        onError: 'error',
      },
    },
    loaded: {
      invoke: {
        id: 'midi-access',
        src: 'midi-access',
        input: ({ context }) => ({ midiAccess: context.midiAccess! }),
      },
    },
    error: {},
  },
})
