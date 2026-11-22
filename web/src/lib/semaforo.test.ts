import { describe, expect, it } from 'vitest'
import { peor, semaforoPorLimites, type Limite } from './semaforo'

const base = { componente: null, tipo_equipo: null, precaucion_min: null, precaucion_max: null, critico_min: null, critico_max: null }

describe('peor', () => {
  it('devuelve el más grave', () => {
    expect(peor('normal', 'critico', 'precaucion')).toBe('critico')
    expect(peor('normal', null, undefined)).toBe('normal')
    expect(peor(null, undefined)).toBeNull()
  })
})

describe('semaforoPorLimites', () => {
  const limites: Limite[] = [
    { ...base, parametro_codigo: 'fe', precaucion_max: 50, critico_max: 100 },
    { ...base, parametro_codigo: 'fe', componente: 'motor', precaucion_max: 80, critico_max: 150 },
    { ...base, parametro_codigo: 'tbn', precaucion_min: 5, critico_min: 3 },
  ]

  it('usa el límite general sin componente específico', () => {
    expect(semaforoPorLimites(limites, 'fe', 40, 'hidraulico', null)).toBe('normal')
    expect(semaforoPorLimites(limites, 'fe', 60, 'hidraulico', null)).toBe('precaucion')
    expect(semaforoPorLimites(limites, 'fe', 100, 'hidraulico', null)).toBe('critico')
  })

  it('prefiere el límite del componente', () => {
    expect(semaforoPorLimites(limites, 'fe', 60, 'motor', 'camion')).toBe('normal')
    expect(semaforoPorLimites(limites, 'fe', 120, 'motor', 'camion')).toBe('precaucion')
  })

  it('maneja límites mínimos (TBN que baja)', () => {
    expect(semaforoPorLimites(limites, 'tbn', 8, 'motor', null)).toBe('normal')
    expect(semaforoPorLimites(limites, 'tbn', 4, 'motor', null)).toBe('precaucion')
    expect(semaforoPorLimites(limites, 'tbn', 2.5, 'motor', null)).toBe('critico')
  })

  it('sin límite configurado no inventa semáforo', () => {
    expect(semaforoPorLimites(limites, 'cu', 999, 'motor', null)).toBeNull()
  })
})
