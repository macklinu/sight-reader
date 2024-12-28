import { dequal } from 'dequal'
import { useEffect, useReducer, useRef, useState } from 'react'
import * as v from 'valibot'
import { Renderer, Stave, StaveNote, TickContext } from 'vexflow'

export function meta() {
  return [
    { title: 'New React Router App' },
    { name: 'description', content: 'Welcome to React Router!' },
  ]
}

const isMidiConnectionEvent = (event: Event): event is MIDIConnectionEvent =>
  'port' in event

const MidiMessage = {
  NOTE_ON: 144,
  NOTE_OFF: 128,
  ACTIVE_SENSING: 254,
} as const

const NoteOn = v.pipe(
  v.strictTuple([v.literal(MidiMessage.NOTE_ON), v.number(), v.number()]),
  v.transform(
    ([_, key, velocity]) =>
      ({
        // Some midi keyboards send Note On message with velocity 0 to indicate Note Off
        type: velocity > 0 ? 'note-on' : 'note-off',
        key,
        velocity,
      }) as const
  )
)

const NoteOff = v.pipe(
  v.strictTuple([v.literal(MidiMessage.NOTE_OFF), v.number(), v.number()]),
  v.transform(
    ([_, key, velocity]) =>
      ({
        type: 'note-off',
        key,
        velocity,
      }) as const
  )
)

const Unknown = v.pipe(
  v.array(v.number()),
  v.transform(
    (data) =>
      ({
        type: 'unknown',
        data,
      }) as const
  )
)

const Parser = v.union([NoteOn, NoteOff, Unknown])

const statusMessagesToIgnore = new Set<number>([MidiMessage.ACTIVE_SENSING])

interface State {
  midiAccess: MIDIAccess | null
  selectedMidiDeviceId: string | null
}

const initialState: State = {
  midiAccess: null,
  selectedMidiDeviceId: null,
}

type Action =
  | { type: 'obtain-midi-access'; payload: MIDIAccess }
  | { type: 'midi-access-state-change'; payload: MIDIConnectionEvent }
  | { type: 'select-midi-device'; payload: string }
  | { type: 'deselect-midi-device' }

export default function Home() {
  const [state, dispatch] = useReducer(
    (state: State, action: Action): State => {
      switch (action.type) {
        case 'obtain-midi-access': {
          if (dequal(state.midiAccess, action.payload)) {
            return state
          }
          return { ...state, midiAccess: action.payload }
        }
        case 'midi-access-state-change': {
          if (!action.payload.port) {
            return state
          }
          if (
            action.payload.port.state === 'disconnected' &&
            action.payload.port.id === state.selectedMidiDeviceId
          ) {
            console.log('uh oh! selected device disconnected')
            return { ...state, selectedMidiDeviceId: null }
          }
          return state
        }
        case 'select-midi-device': {
          if (state.selectedMidiDeviceId === action.payload) {
            return state
          }
          return { ...state, selectedMidiDeviceId: action.payload }
        }
        case 'deselect-midi-device': {
          if (state.selectedMidiDeviceId === null) {
            return state
          }
          return { ...state, selectedMidiDeviceId: null }
        }
        default:
          return state
      }
    },
    initialState
  )

  const [notes, setNotes] = useState<Set<number>>(new Set())

  function toNotation(note: number) {
    const chromaticNotes = [
      'c',
      'db',
      'd',
      'eb',
      'e',
      'f',
      'gb',
      'g',
      'ab',
      'a',
      'bb',
      'b',
    ]

    const key = chromaticNotes[note % 12]
    const octave = Math.floor(note / 12) - 1

    return { key, octave }
  }

  useEffect(() => {
    navigator.permissions
      .query({ name: 'midi', sysex: true })
      .then((permissions) => {
        if (permissions.state === 'denied') {
          // or set a state?
          throw new Error('MIDI access denied')
        }
        return navigator.requestMIDIAccess({ sysex: true })
      })
      .then((midiAccess) => {
        dispatch({ type: 'obtain-midi-access', payload: midiAccess })
      })
  }, [dispatch])

  useEffect(() => {
    if (!state.midiAccess) {
      return
    }

    const controller = new AbortController()

    state.midiAccess.addEventListener(
      'statechange',
      (event) => {
        if (isMidiConnectionEvent(event)) {
          dispatch({ type: 'midi-access-state-change', payload: event })
        }
      },
      { signal: controller.signal }
    )

    return () => {
      controller.abort()
    }
  }, [state.midiAccess])

  useEffect(() => {
    if (!state.selectedMidiDeviceId) {
      return
    }

    const controller = new AbortController()

    state.midiAccess?.inputs.get(state.selectedMidiDeviceId)?.addEventListener(
      'midimessage',
      (event) => {
        const messageStatus = event.data?.at(0)
        if (typeof messageStatus === 'undefined') {
          return
        }
        if (statusMessagesToIgnore.has(messageStatus)) {
          return
        }
        const result = v.parse(Parser, Array.from(event.data ?? []))

        switch (result.type) {
          case 'note-on': {
            setNotes((notes) => new Set(notes).add(result.key))
            break
          }
          case 'note-off': {
            setNotes((notes) => {
              const set = new Set(notes)
              set.delete(result.key)
              return set
            })
            break
          }
          default:
            break
        }

        console.log(result)
      },
      { signal: controller.signal }
    )

    return () => {
      controller.abort()
    }
  }, [state.midiAccess, state.selectedMidiDeviceId])

  const staffRef = useRef<HTMLCanvasElement | null>(null)
  const vf = useRef<Renderer | null>(null)

  useEffect(() => {
    if (!vf.current) {
      vf.current = new Renderer(staffRef.current!, Renderer.Backends.CANVAS)
    }
    vf.current.resize(300, 280)

    const ctx = vf.current.getContext()

    const stave = new Stave(10, 0, 100).addClef('treble')

    const keys = Array.from(notes)
      .map(toNotation)
      .map(({ key, octave }) => `${key}/${octave}`)
    const note = new StaveNote({
      keys: keys.length > 0 ? keys : ['c/5'],
      auto_stem: true,
      duration: '8',
    }).setStave(stave)

    note.setStyle({
      shadowBlur: 2,
    })

    new TickContext().addTickable(note).preFormat().setX(25)

    ctx.scale(3, 3)

    stave.setContext(ctx).draw()
    note.setContext(ctx).draw()
  }, [notes])

  return (
    <div>
      <h1>Home</h1>
      <select
        value={state.selectedMidiDeviceId ?? ''}
        onChange={(e) => {
          dispatch({ type: 'select-midi-device', payload: e.target.value })
        }}
      >
        <option value=''>Select a MIDI device</option>
        {(state.midiAccess?.inputs?.values()?.toArray() ?? []).map((input) => (
          <option key={input.id} value={input.id}>
            {input.name} - {input.manufacturer}
          </option>
        ))}
      </select>
      <canvas ref={staffRef} />
    </div>
  )
}
